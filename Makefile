.PHONY: frontend backend backend-test backend-smoke

frontend:
	@./scripts/run-frontend

backend:
	@command -v uv >/dev/null 2>&1 || { echo "uv is required: https://docs.astral.sh/uv/" >&2; exit 1; }
	@cd backend && uv run --python 3.12 python -m study_buddy

backend-test:
	@cd backend && uv run --python 3.12 python -m unittest discover -s tests

backend-smoke:
	@cd backend && uv run --python 3.12 python scripts/smoke.py
