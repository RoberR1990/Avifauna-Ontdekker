import json
import sys
from pathlib import Path

import pytest

PIPELINE = Path(__file__).resolve().parents[2]
if str(PIPELINE) not in sys.path:
    sys.path.insert(0, str(PIPELINE))

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def names():
    return json.loads((FIXTURES / "bird-names-test.json").read_text(encoding="utf-8"))["species"]
