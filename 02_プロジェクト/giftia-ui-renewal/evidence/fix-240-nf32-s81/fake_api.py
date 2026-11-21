import sys, json, os
sys.path.insert(0, "/Users/hiroki_asada/GitHub/model_team18_tech0/.command-center/worktrees/240-kurosu/backend")
sys.path.insert(0, "/Users/hiroki_asada/GitHub/model_team18_tech0/.command-center/worktrees/240-kurosu/backend/tests")
import main
from db import get_db
from candidates_support import CandidateDb, fd1, fd1_counts
from test_products_filter import SpyDb, fd9
D = {"fd1": CandidateDb(fd1(), fd1_counts()), "fd9": SpyDb(fd9())}
MODE = os.environ["KZ"] + "/gen_mode"
def pick():
    try: return D[json.load(open(MODE))["dataset"]]
    except Exception: return D["fd1"]
main.app.dependency_overrides[get_db] = pick
app = main.app
