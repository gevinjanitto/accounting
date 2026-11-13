#!/bin/sh
# Local preview only: start MariaDB on a persistent datadir under /app and ensure the database/user exist.
DATADIR=/app/.mariadb-data
mkdir -p /run/mysqld "$DATADIR" && chown -R mysql:mysql /run/mysqld "$DATADIR"
if [ ! -d "$DATADIR/mysql" ]; then
  mysql_install_db --user=mysql --datadir="$DATADIR" --auth-root-authentication-method=socket >/dev/null
fi
(
  for i in $(seq 1 60); do mysqladmin -uroot ping >/dev/null 2>&1 && break; sleep 1; done
  mysql -uroot -e "CREATE DATABASE IF NOT EXISTS maiharta_finance CHARACTER SET utf8mb4;
    CREATE USER IF NOT EXISTS 'finance'@'127.0.0.1' IDENTIFIED BY 'financepass';
    CREATE USER IF NOT EXISTS 'finance'@'localhost' IDENTIFIED BY 'financepass';
    GRANT ALL ON maiharta_finance.* TO 'finance'@'127.0.0.1'; GRANT ALL ON maiharta_finance.* TO 'finance'@'localhost'; FLUSH PRIVILEGES;"
) &
exec /usr/bin/mysqld_safe --user=mysql --datadir="$DATADIR"
