CREATE DATABASE IF NOT EXISTS incident_tracker;
USE incident_tracker;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS incidents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  severity ENUM('low','medium','high','critical') NOT NULL,
  status ENUM('open','investigating','resolved') NOT NULL DEFAULT 'open',
  reporter_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reporter_id) REFERENCES users(id)
);

-- Least-privilege app user (run as admin; change the password)
-- CREATE USER 'tracker_app'@'%' IDENTIFIED BY 'change-me';
-- GRANT SELECT, INSERT, UPDATE ON incident_tracker.* TO 'tracker_app'@'%';
