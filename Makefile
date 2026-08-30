PYTHON ?= python3
PORT ?= 8000

.PHONY: setup pipeline dashboard clean

setup:
	$(PYTHON) -m pip install -r requirements.txt

# Part 1 builds the database from the CSV; Parts 2-4 read it back and write
# their tables and figure into output/.
pipeline:
	$(PYTHON) load_data.py
	$(PYTHON) generate_outputs.py

# Bound to 0.0.0.0 so a container port forwarder can reach it. Locally the
# same server is at http://localhost:$(PORT).
dashboard:
	$(PYTHON) -m uvicorn app:app --host 0.0.0.0 --port $(PORT)

clean:
	rm -rf output teiko.db __pycache__
