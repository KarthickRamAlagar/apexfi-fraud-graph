"""Sandbox version of ml/build_dgraph_fin_graph_data.py: same logic, reads the Gold Parquet files instead of Postgres; node_timestamp left out."""
import numpy as np, pandas as pd, torch
from sklearn.model_selection import train_test_split
from torch_geometric.data import Data
P='/home/claude/v2/gold_parquet/'
df=pd.read_parquet(P+'dgraph_fin_nodes.parquet'); print(len(df))
nid={n:i for i,n in enumerate(df['node_id'])}
is_labeled=df['label'].isin(['fraud','normal']); y=torch.full((len(df),),-1,dtype=torch.long); y[(df['label']=='fraud').values]=1; y[(df['label']=='normal').values]=0
fc=[c for c in df.columns if c.startswith('x')]; print(fc)
x=torch.tensor(np.concatenate([df[fc].fillna(0).values,df['total_degree'].fillna(0).values.reshape(-1,1)],1),dtype=torch.float); print(x.shape)
ed=pd.read_parquet(P+'dgraph_fin_edges.parquet',columns=['src_node_id','dst_node_id'])
src=ed['src_node_id'].map(nid).values; dst=ed['dst_node_id'].map(nid).values; ok=~(np.isnan(src)|np.isnan(dst)); src,dst=src[ok].astype(int),dst[ok].astype(int)
ei=torch.tensor(np.concatenate([np.stack([src,dst]),np.stack([dst,src])],1),dtype=torch.long)
li=np.where(is_labeled.values)[0]; ly=y[li].numpy()
tr,tmp=train_test_split(li,test_size=0.3,stratify=ly,random_state=42); va,te=train_test_split(tmp,test_size=0.5,stratify=y[tmp].numpy(),random_state=42)
m=lambda ix:(lambda z:(z.__setitem__(torch.as_tensor(ix),True),z)[1])(torch.zeros(len(df),dtype=torch.bool))
d=Data(x=x,edge_index=ei,y=y); d.train_mask,d.val_mask,d.test_mask=m(tr),m(va),m(te); d.node_ids=torch.tensor(df['node_id'].values,dtype=torch.long)
print(d, d.train_mask.sum().item(), d.val_mask.sum().item(), d.test_mask.sum().item(), 'fraud% train',y[tr].float().mean().item()*100)
torch.save(d,'dgraph_fin_graph.pt')
