import sys, time, threading, statistics
import types; sys.modules["jaconv"]=types.ModuleType("jaconv")
sys.path.insert(0, "/Users/hiroki_asada/GitHub/model_team18_tech0/.command-center/worktrees/product-detail-slow-terao/backend")
from dotenv import load_dotenv
load_dotenv("/Users/hiroki_asada/GitHub/model_team18_tech0/backend/.env")
from database import get_connection
import ast
_src=open("/Users/hiroki_asada/GitHub/model_team18_tech0/.command-center/worktrees/product-detail-slow-terao/backend/api/product_detail.py").read()
SELECT_PRODUCT=[ast.literal_eval(n.value) for n in ast.parse(_src).body if isinstance(n,ast.Assign) and n.targets[0].id=="SELECT_PRODUCT"][0]
from decision import scene_params
ids = ["G3759","G4246","G7337","G1156","G5911","G4473"]
tags = scene_params("送別")
def q(conn, pid, scene=True):
    flag = 1 if scene else 0
    t = tags if scene else ("", "", 0, "")
    t0 = time.perf_counter()
    with conn.cursor() as c:
        c.execute(SELECT_PRODUCT, (flag, *t, pid)); r = c.fetchall()
    return time.perf_counter()-t0, len(r)
print("== A 新規接続の時間(5回)")
for _ in range(5):
    t0=time.perf_counter(); c=get_connection(); d=time.perf_counter()-t0; c.close(); print(f"connect {d*1000:.0f} ms")
print("== B 1接続で 詳細 SELECT（送別あり）6商品 ×2周")
c=get_connection()
for rnd in range(2):
    print([f"{q(c,p)[0]*1000:.0f}" for p in ids])
print("== C シーンなし")
print([f"{q(c,p,False)[0]*1000:.0f}" for p in ids])
c.close()
print("== D 6本同時・各自が新規接続して SELECT")
res={}
def w(p):
    t0=time.perf_counter(); cc=get_connection(); tc=time.perf_counter()-t0
    ts,_=q(cc,p); res[p]=(tc,ts,time.perf_counter()-t0); cc.close()
th=[threading.Thread(target=w,args=(p,)) for p in ids]
[t.start() for t in th]; [t.join() for t in th]
for p in ids: print(p, "connect %.0f sql %.0f total %.0f ms"%tuple(x*1000 for x in res[p]))
print("== E 6本同時・接続は先に4本作って使い回し（DB_IDLE_MAX=4 の想定）")
pool=[get_connection() for _ in range(4)]; lock=threading.Lock(); res={}
def w2(p):
    t0=time.perf_counter()
    with lock: cc = pool.pop() if pool else None
    new = cc is None
    if new: cc=get_connection()
    ts,_=q(cc,p); res[p]=(new,time.perf_counter()-t0)
    with lock:
        if len(pool)<4: pool.append(cc)
        else: cc.close()
th=[threading.Thread(target=w2,args=(p,)) for p in ids]
[t.start() for t in th]; [t.join() for t in th]
for p in ids: print(p, "new" if res[p][0] else "reused", "%.0f ms"%(res[p][1]*1000))
