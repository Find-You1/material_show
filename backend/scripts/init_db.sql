-- 初始化数据库与专用账号（以 root 执行一次）
-- 用法：mysql -u root -p < scripts/init_db.sql
--
-- 生产部署前务必先做两件事：
--   1. 把下面两处 'ms_app_pwd_2026' 换成强密码，并与 backend/.env 的 DATABASE_URL 保持一致。
--   2. 'CREATE USER IF NOT EXISTS' 对已存在的账号是空操作，不会改密码。
--      如果之前建过这个号又想换密码，要么先 DROP USER，要么单独执行：
--          ALTER USER 'ms_app'@'127.0.0.1' IDENTIFIED BY '新密码';
--          ALTER USER 'ms_app'@'localhost' IDENTIFIED BY '新密码';
--
-- 需要 MySQL 8.0（utf8mb4_0900_ai_ci 排序规则 MariaDB 不支持，别用发行版自带的 mariadb-server）。
-- 全文检索还需要 innodb_ft_enable_stopword=OFF，见 scripts/mysql-ngram.cnf。

CREATE DATABASE IF NOT EXISTS material_show
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'ms_app'@'127.0.0.1' IDENTIFIED BY 'ms_app_pwd_2026';
CREATE USER IF NOT EXISTS 'ms_app'@'localhost' IDENTIFIED BY 'ms_app_pwd_2026';

GRANT ALL PRIVILEGES ON material_show.* TO 'ms_app'@'127.0.0.1';
GRANT ALL PRIVILEGES ON material_show.* TO 'ms_app'@'localhost';

FLUSH PRIVILEGES;