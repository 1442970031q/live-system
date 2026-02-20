// 配置文件
module.exports = {
  port: 3001,
  host: '0.0.0.0',
  mysql: {
    host: 'mysql2.sqlpub.com',
    user: 'gaojiewei',
    password: 'cnBKhgqzNCVwA1Q9',
    database: 'live_system',
    port: 3307
  },
  jwt: {
    secret: 'your_jwt_secret_key',
    expiresIn: '24h'
  }
};
