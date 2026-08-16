help:
	@echo 'start                  - start db and migrate'
	@echo 'stop                   - shut down and remove db'
	@echo 'restart                - shut down and create new database'

start:
	docker-compose up -d

stop:
	docker-compose down

restart:
	make stop
	make start
