"""ApexFi V2 SDG engine. Turns REAL scored transactions (payload from the fraud engine) into money, workload and uncertainty ranges.
Every output carries a tag:  MEASURED (counted from the payload) | DERIVED (arithmetic on measured + stated assumptions) | SCENARIO (scaled / assumed).
Wording rule: results are 'aligned with' SDG targets, never 'contributes X%'."""
from __future__ import annotations
import math, numpy as np
from dataclasses import dataclass, asdict

@dataclass
class Assumptions:
    prevention_rate: float = 0.90     # share of a correctly flagged fraud's value that is actually stopped   (ASSUMPTION)
    loss_given_miss: float = 1.00     # share of a missed fraud's value that is lost                          (ASSUMPTION)
    review_cost: float = 2.0          # cost to review one flagged transaction                                (ASSUMPTION)
    friction_cost: float = 1.0        # extra cost of one false alarm to an honest customer                   (ASSUMPTION)
    minutes_per_review: float = 5.0   # analyst time per alert                                                (ASSUMPTION)
    analysts: int = 20                # analysts on shift                                                     (ASSUMPTION)
    shift_hours: float = 8.0
    scale_to_daily: float | None = None   # if set: replay window is scaled to this many transactions per day  (SCENARIO)
    hold_hours: float = 4.0           # how long an honest payment is held while a false alarm is reviewed       (ASSUMPTION)
    annual_rate: float = 0.0583       # cost of funds: RBI call-money rate 2017-18 from the Gold layer (5.83%)     (MEASURED rate, assumed use)
    currency: str = 'USD'

def erlang_c(lmbda, mu, c):
    """M/M/c queue. lmbda=arrivals/hour, mu=services/hour per analyst, c=analysts. Returns utilisation, P(wait), mean wait (minutes)."""
    a=lmbda/mu; rho=a/c
    if rho>=1: return dict(utilisation=rho,p_wait=1.0,mean_wait_min=float('inf'),stable=False)
    B=1.0
    for k in range(1,c+1): B=a*B/(k+a*B)          # Erlang-B recurrence: stable for thousands of servers
    pw=B/(1-rho*(1-B))
    wq=pw/(c*mu-lmbda)*60; return dict(utilisation=rho,p_wait=pw,mean_wait_min=wq,stable=True)

def analysts_needed(lmbda, mu, target_wait_min=10.0, cmax=2000):
    for c in range(max(1,int(lmbda/mu)+1),cmax):
        r=erlang_c(lmbda,mu,c)
        if r['stable'] and r['mean_wait_min']<=target_wait_min: return c
    return None

def evaluate(amount, score, threshold, label=None, A: Assumptions=Assumptions(), n_mc=2000, seed=0, window_hours=None):
    amount=np.asarray(amount,float); score=np.asarray(score,float); flag=score>=threshold; n=len(amount); out={'n_transactions':int(n),'threshold':float(threshold),'assumptions':asdict(A),'tags':{}}
    out['flagged']=int(flag.sum()); out['flag_rate_pct']=float(100*flag.mean()); out['tags']['flagged']='MEASURED'
    if label is None:   # no ground truth: only workload + exposure can be computed
        out['value_flagged']=float(amount[flag].sum()); out['tags']['value_flagged']='MEASURED'; label_known=False
    else:
        y=np.asarray(label).astype(int); label_known=True
        tp=flag&(y==1); fp=flag&(y==0); fn=(~flag)&(y==1); tn=(~flag)&(y==0)
        out.update(tp=int(tp.sum()),fp=int(fp.sum()),fn=int(fn.sum()),tn=int(tn.sum()),fraud_total=int((y==1).sum()),
                   fraud_value_total=float(amount[y==1].sum()),value_flagged_fraud=float(amount[tp].sum()),value_missed_fraud=float(amount[fn].sum()),value_blocked_honest=float(amount[fp].sum()))
        for k in ('tp','fp','fn','tn','fraud_total','fraud_value_total','value_flagged_fraud','value_missed_fraud','value_blocked_honest'): out['tags'][k]='MEASURED'
        out['recall']=out['tp']/max(1,out['fraud_total']); out['precision']=out['tp']/max(1,out['flagged']); out['value_recall']=out['value_flagged_fraud']/max(1e-9,out['fraud_value_total'])
        out['honest_blocked_per_10k']=float(1e4*out['fp']/max(1,out['fp']+out['tn']))
        stopped=A.prevention_rate*out['value_flagged_fraud']; leaked=A.loss_given_miss*out['value_missed_fraud']+(1-A.prevention_rate)*out['value_flagged_fraud']
        cost=out['flagged']*A.review_cost+out['fp']*A.friction_cost; net=stopped-cost
        out.update(value_stopped=stopped,value_leaked=leaked,operating_cost=cost,net_benefit=net,loss_without_model=A.loss_given_miss*out['fraud_value_total'])
        out['float_cost']=out['value_blocked_honest']*A.annual_rate*A.hold_hours/8760.0   # interest on honest money held during review; NOT included in net (reported to show it is immaterial)
        for k in ('value_stopped','value_leaked','operating_cost','net_benefit','loss_without_model','float_cost'): out['tags'][k]='DERIVED'
        # Monte-Carlo: bootstrap the transactions AND draw the assumptions from plausible ranges
        rng=np.random.RandomState(seed); res=[]
        for _ in range(n_mc):
            ix=rng.randint(0,n,n); f,yy,aa=flag[ix],y[ix],amount[ix]
            pr=rng.uniform(max(0.5,A.prevention_rate-0.2),min(1.0,A.prevention_rate+0.1)); rc=rng.uniform(A.review_cost*0.5,A.review_cost*2); fc=rng.uniform(A.friction_cost*0.5,A.friction_cost*2)
            res.append((pr*aa[f&(yy==1)].sum())-f.sum()*rc-(f&(yy==0)).sum()*fc)
        res=np.array(res); out['net_benefit_mc']=dict(p05=float(np.percentile(res,5)),p50=float(np.percentile(res,50)),p95=float(np.percentile(res,95)),prob_positive=float((res>0).mean()),draws=n_mc); out['tags']['net_benefit_mc']='SCENARIO'
    # workload: queueing model
    hours=window_hours if window_hours else (24.0 if A.scale_to_daily else None)
    scale=(A.scale_to_daily/n) if A.scale_to_daily else 1.0
    if hours:
        lam=out['flagged']*scale/hours*(24.0/24.0)    # alerts per hour (flat arrival assumption)
        mu=60.0/A.minutes_per_review; q=erlang_c(lam,mu,A.analysts); out['workload']=dict(alerts_per_hour=lam,analyst_hours_per_day=out['flagged']*scale*A.minutes_per_review/60.0,**q,analysts_needed_for_10min_wait=analysts_needed(lam,mu,10.0)); out['tags']['workload']='SCENARIO'
    if A.scale_to_daily and label_known:
        s=A.scale_to_daily/n; out['scaled_daily']={k:out[k]*s for k in ('tp','fp','fn','value_stopped','value_leaked','operating_cost','net_benefit')}; out['tags']['scaled_daily']='SCENARIO'
    # SDG alignment (descriptive indicators, not impact claims)
    if label_known:
        out['sdg_alignment']=[
         dict(sdg='16',target='16.4 reduce illicit financial flows',indicator='fraud value stopped / total fraud value',value=float(stopped/max(1e-9,out['fraud_value_total'])),tag='DERIVED'),
         dict(sdg='8',target='8.10 strengthen domestic financial institutions',indicator='honest customers wrongly blocked per 10,000 honest transactions (lower is better)',value=out['honest_blocked_per_10k'],tag='MEASURED'),
         dict(sdg='9',target='9.3 / 9.c reliable financial infrastructure',indicator='analyst hours per day needed',value=out.get('workload',{}).get('analyst_hours_per_day'),tag='SCENARIO'),
         dict(sdg='1',target='1.4 equal access to financial services',indicator='value of fraud still leaking (lower is better)',value=float(leaked),tag='DERIVED')]
    return out
