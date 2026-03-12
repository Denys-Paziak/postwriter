.PHONY: dev install

# Start both servers (Ctrl+C stops both)
dev:
	@echo "Backend:  http://localhost:8000"
	@echo "Frontend: http://localhost:3000"
	@echo "API Docs: http://localhost:8000/docs"
	@echo ""
	@trap 'kill 0' INT; \
	(cd server && venv/bin/uvicorn main:app --reload --port 8000) & \
	(cd client && npm run dev) & \
	wait

# Install all dependencies
install:
	cd server && python3.13 -m venv venv && venv/bin/pip install -r requirements.txt
	cd client && npm install
