const { Sequelize, DataTypes } = require('sequelize');
const config = require('./config');

// 初始化 Sequelize 实例
const sequelize = new Sequelize(
  config.mysql.database,
  config.mysql.user,
  config.mysql.password,
  {
    host: config.mysql.host,
    port: config.mysql.port,
    dialect: 'mysql',
    pool: {
      max: 10,           // 最大连接数，与原配置一致
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    logging: false,      // 生产环境可关闭 SQL 日志
    timezone: '+08:00'   // 设置时区为北京时间
  }
);

// 定义用户模型
const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  username: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(100),
    unique: true,
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  avatar: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  bio: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'idx_username', fields: ['username'] },
    { name: 'idx_email', fields: ['email'] }
  ]
});

// 定义直播模型
const Stream = sequelize.define('Stream', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'user_id',
    references: {
      model: User,
      key: 'id'
    }
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('offline', 'live', 'ended'),
    defaultValue: 'offline',
    allowNull: false
  },
  streamKey: {
    type: DataTypes.STRING(100),
    unique: true,
    allowNull: false,
    field: 'stream_key'
  },
  thumbnail: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  viewCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'view_count'
  },
  startTime: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'start_time'
  },
  endTime: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'end_time'
  }
}, {
  tableName: 'streams',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'idx_user_id', fields: ['user_id'] },
    { name: 'idx_status', fields: ['status'] }
  ]
});

// 定义弹幕/评论模型
const Comment = sequelize.define('Comment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'user_id',
    references: {
      model: User,
      key: 'id'
    }
  },
  streamId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'stream_id',
    references: {
      model: Stream,
      key: 'id'
    }
  },
  content: {
    type: DataTypes.STRING(500),
    allowNull: false
  }
}, {
  tableName: 'comments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { name: 'idx_stream_id', fields: ['stream_id'] },
    { name: 'idx_created_at', fields: ['created_at'] }
  ]
});

// 定义关注模型
const Follow = sequelize.define('Follow', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  followerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'follower_id',
    references: {
      model: User,
      key: 'id'
    }
  },
  followingId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'following_id',
    references: {
      model: User,
      key: 'id'
    }
  }
}, {
  tableName: 'follows',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { name: 'idx_follower', fields: ['follower_id'] },
    { name: 'idx_following', fields: ['following_id'] },
    { name: 'unique_follow', fields: ['follower_id', 'following_id'], unique: true }
  ]
});

// 定义直播观看记录模型
const StreamView = sequelize.define('StreamView', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  streamId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'stream_id',
    references: {
      model: Stream,
      key: 'id'
    }
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'user_id',
    references: {
      model: User,
      key: 'id'
    }
  },
  joinTime: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'join_time'
  },
  leaveTime: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'leave_time'
  }
}, {
  tableName: 'stream_views',
  timestamps: false,
  indexes: [
    { name: 'idx_stream_user', fields: ['stream_id', 'user_id'] }
  ]
});

// 建立模型关联关系
User.hasMany(Stream, { foreignKey: 'userId', onDelete: 'CASCADE' });
Stream.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Comment, { foreignKey: 'userId', onDelete: 'CASCADE' });
Comment.belongsTo(User, { foreignKey: 'userId' });

Stream.hasMany(Comment, { foreignKey: 'streamId', onDelete: 'CASCADE' });
Comment.belongsTo(Stream, { foreignKey: 'streamId' });

// 多对多关系：用户关注
User.belongsToMany(User, {
  through: Follow,
  foreignKey: 'followerId',
  otherKey: 'followingId',
  as: 'Following',
  onDelete: 'CASCADE'
});

User.belongsToMany(User, {
  through: Follow,
  foreignKey: 'followingId',
  otherKey: 'followerId',
  as: 'Followers',
  onDelete: 'CASCADE'
});

Stream.hasMany(StreamView, { foreignKey: 'streamId', onDelete: 'CASCADE' });
StreamView.belongsTo(Stream, { foreignKey: 'streamId' });

User.hasMany(StreamView, { foreignKey: 'userId', onDelete: 'SET NULL' });
StreamView.belongsTo(User, { foreignKey: 'userId' });

// 初始化数据库连接和表结构
async function initDB() {
  try {
    // 验证数据库连接
    await sequelize.authenticate();
    console.log('Database connection has been established successfully.');
    
    // 同步模型到数据库（生产环境建议使用 migrations）
    await sequelize.sync({ alter: true });
    console.log('Database tables have been synchronized.');
    
    return sequelize;
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
}

module.exports = {
  sequelize,
  initDB,
  Op: Sequelize.Op,
  models: {
    User,
    Stream,
    Comment,
    Follow,
    StreamView
  }
};
