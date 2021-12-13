help:
	@echo 'start                  - start db and migrate'
	@echo 'stop                   - shut down and remove db'
	@echo 'restart                - shut down and create new database'
	@echo 'data                   - load fixtures (test data)'
	@echo 'format                 - format code using ktlint'
	@echo 'test                   - run all tests'

start: 
	docker-compose up -d

stop:
	docker-compose down

restart:
	make stop
	make start

# data: 
# 	docker exec -i KB psql -U root -d root < commands.sql
