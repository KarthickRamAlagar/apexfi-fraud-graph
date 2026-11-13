import sys,json,math; sys.path.insert(0,'/home/claude/v2'); from common import *
R=OUT; D='/home/claude/repo/apexfi-upload/streamlit_app/data/'
def cl(o):
    if isinstance(o,dict): return {k:cl(v) for k,v in o.items()}
    if isinstance(o,(list,tuple)): return [cl(v) for v in o]
    if isinstance(o,(np.floating,float)): return None if (math.isnan(o) or math.isinf(o)) else float(o)
    if isinstance(o,np.integer): return int(o)
    return o
fin=json.load(open(f'{R}/final/final_results.json')); F=fin['finance']
B=pd.read_csv(f'{R}/benchmark_temporal_table.csv'); BR=pd.read_csv(f'{R}/benchmark_random_table.csv'); BD=pd.read_csv(f'{R}/benchmark_dgraph_all_table.csv')
fs=pd.read_csv(f'{R}/featsel_temporal/featsel_table.csv'); imb=pd.read_csv(f'{R}/imbalance_temporal/imbalance_table.csv'); fsets=pd.read_csv(f'{R}/featsets_temporal.csv')
tu=json.load(open(f'{R}/tune_temporal/tune_results.json')); seeds=json.load(open(f'{R}/imbalance_seeds_temporal.json')); v1d=json.load(open(f'{R}/v1_dgraph_ablation.json')); dgs=json.load(open(f'{R}/dgraph_v2_feature_sets.json')); v1r=json.load(open(f'{R}/v1_rerun.json'))
DG='/home/claude/dgretrain/streamlit_app/data/'
ms=json.load(open(DG+'multiseed_dgraph_fin.json')); op=json.load(open(DG+'model_metrics_dgraph_fin_operating_point.json')); gm=json.load(open(DG+'model_metrics_dgraph_fin.json'))
RETR=dict(split='random 70/15/15 of 1,225,601 labelled accounts (857,920 train / 183,840 validation / 183,841 test), 18 features, node_timestamp removed',
  lightgbm=dict(roc_auc=ms['lightgbm']['roc_auc']['mean'],pr_auc=ms['lightgbm']['pr_auc']['mean'],pr_std=ms['lightgbm']['pr_auc']['std']),
  graphsage=dict(roc_auc=gm['roc_auc'],pr_auc=gm['pr_auc'],note='single run, 4 epochs'),
  stacked=dict(roc_auc=ms['stacked']['roc_auc']['mean'],pr_auc=ms['stacked']['pr_auc']['mean'],roc_std=ms['stacked']['roc_auc']['std'],pr_std=ms['stacked']['pr_auc']['std'],seeds=3),
  operating_point=op, base_rate_pct=1.27, old_leaky=dict(roc_auc=0.938,pr_auc=0.585))
keep=lambda d,ks:{k:d.get(k) for k in ks}
S=dict(
 title='ApexFi V2 evaluation', data=dict(ieee_rows=590540,dgraph_nodes=3700550,dgraph_labelled=1225601,labelled_records=4291090,ieee_edges=17322878,dgraph_edges=4300999),
 protocol='Time-ordered split: first 75% of transactions to fit/validate, last 25% (147,635 rows, 5,100 frauds) as the untouched test block. Winners chosen on validation PR-AUC. A challenger replaces the incumbent only if it is at least 1% better.',
 decision=fin['decision'], final=F['FINAL (production)'], v1=F['V1 temporal model (7 features)'], significance=fin['significance'],
 stage=fin['rows'], finance=F, stability=fin['stability'], drift=fin['drift'],
 benchmark=B[['rank_val','model','family','val_pr','test_pr','test_roc','f1_val_thr','prec','rec','mcc','ks']].to_dict('records'),
 benchmark_random=BR[['model','test_pr','test_roc']].to_dict('records'),
 feature_sets=fsets.to_dict('records'), feature_selection=fs.to_dict('records'), imbalance=imb.to_dict('records'), imbalance_seeds=seeds,
 tuning={k:tu[k] for k in ['Default','Grid search (sampled)','Randomized search','Optuna (TPE)']}, tuning_importance=tu['optuna_param_importance'],
 dgraph=dict(v1_ablation={k:keep(v,['roc_auc','pr_auc','precision','recall']) for k,v in v1d.items() if isinstance(v,dict) and 'roc_auc' in v}, v2_sets={k:keep(v,['roc_auc','pr_auc','n_features']) for k,v in dgs.items()},
   benchmark=BD[['rank_val','model','val_pr','test_pr','test_roc','ks']].head(12).to_dict('records'),
   retrained=RETR,
   note='V1 DGraph-Fin numbers (ROC-AUC 0.938) came from node_timestamp, which exists only for fraud accounts. Without it the honest result is ROC-AUC 0.73-0.78 and PR-AUC 0.03-0.04.'),
 v1_rerun=v1r,
 limitations=['IEEE-CIS is US card data in dollars, not UPI.','Benchmark models fit on a 100,000-row sample; the final model uses all 376,469 fit rows.','Most numbers come from one seed; run-to-run noise is about 0.004 PR-AUC.','GraphSAGE and the V1 stacker were not retrained in V2.','Money results depend on assumed review and friction costs.','Column M4 is empty in Gold (ETL defect, to be confirmed in Bronze).'])
S=cl(S)
os.makedirs(D,exist_ok=True); json.dump(S,open(D+'v2_summary.json','w'),indent=1)
meta=json.load(open('cache/ieee_meta.json')); n=meta['n']; k=meta['train_end']
tid=np.load('cache/ieee_tid.npy')[k:n]; dt=np.load('cache/ieee_dt.npy')[k:n]; z=np.load(f'{R}/final/final_probs.npz'); v1=np.load(f'{R}/final/v1_test_probs.npy')
assert len(tid)==len(z['final_test'])==len(v1)
np.savez_compressed(D+'v2_test_scores.npz',tid=tid.astype(np.int64),dt=dt.astype(np.int64),v2=z['final_test'].astype(np.float32),v1=v1.astype(np.float32),y=z['y_test'].astype(np.int8),amount=z['amount_test'].astype(np.float32),threshold_v2=np.float32(F['FINAL (production)']['threshold']),threshold_v1=np.float32(0.6))
print(os.path.getsize(D+'v2_summary.json')//1024,'KB', os.path.getsize(D+'v2_test_scores.npz')//1024,'KB'); print(tid[:3],tid[-3:])
