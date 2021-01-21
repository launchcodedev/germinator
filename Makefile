test-with-postgres:
	docker-compose up -d postgres
	
	POSTGRES_USER=postgres \
	POSTGRES_PASSWORD=postgres \
	POSTGRES_DB=postgres \
	POSTGRES_HOST=localhost \
	POSTGRES_PORT=9827 \
		yarn test
