const IP = '192.168.1.26:3001'
// API服务
const API_URL = `http://${IP}/api`;
// websocket 
const SOCKET_URL = `ws://${IP}/push/comments`;
/** 主播推流用 WebSocket 地址 */
export const getPushStreamWsUrl = (streamId) => `ws://${IP}/push/stream/${streamId}`;

// 认证相关API
export const authAPI = {
  register: async (userData) => {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Registration failed');
    }
    
    return response.json();
  },
  
  login: async (credentials) => {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Login failed');
    }
    
    const data = await response.json();
    if (data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
    }
    
    return data;
  },
  
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },
  
  getCurrentUser: () => {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },
  
  isAuthenticated: () => {
    return !!localStorage.getItem('token');
  }
};

// 直播相关API
export const liveAPI = {
  createStream: async (streamData) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/live/create`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(streamData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create stream');
    }
    
    return response.json();
  },
  
  endStream: async (streamId) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/live/end/${streamId}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to end stream');
    }
    
    return response.json();
  },
  
  getLiveStreams: async () => {
    const response = await fetch(`${API_URL}/live/list`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to get streams');
    }
    
    return response.json();
  },
  
  getStream: async (streamId) => {
    const response = await fetch(`${API_URL}/live/${streamId}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to get stream');
    }
    
    return response.json();
  }
};

// 违禁词/语音检测 API（文本检测用于直播弹幕，语音用于主播说话检测）
export const voiceAPI = {
  checkText: async (text) => {
    const response = await fetch(`${API_URL}/voice/check-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text || "" }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "检测失败");
    }
    return response.json();
  },
  /** 上传音频进行语音转文字 + 敏感词检测，用于直播时主播说话检测。blob 为录音片段（如 webm）。 */
  checkAudio: async (blob) => {
    const form = new FormData();
    form.append("audio", blob, "chunk.webm");
    const response = await fetch(`${API_URL}/voice/check`, {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const e = new Error(err.error || "语音检测失败");
      if (err.matchedWords) e.matchedWords = err.matchedWords;
      throw e;
    }
    return response.json();
  },
};

// 弹幕相关API
export const commentAPI = {
  sendComment: async (streamId, content) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/comments/${streamId}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ content })
    });
    
    if (!response.ok) {
      const body = await response.json();
      const err = new Error(body.message || body.error || 'Failed to send comment');
      if (Array.isArray(body.matchedWords)) err.matchedWords = body.matchedWords;
      throw err;
    }
    
    return response.json();
  },
  
  getComments: async (streamId, limit = 100, offset = 0) => {
    const response = await fetch(`${API_URL}/comments/${streamId}?limit=${limit}&offset=${offset}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to get comments');
    }
    
    return response.json();
  }
};

// 用户相关API
export const userAPI = {
  followUser: async (userId) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/users/follow/${userId}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to follow user');
    }
    
    return response.json();
  },
  
  unfollowUser: async (userId) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/users/unfollow/${userId}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to unfollow user');
    }
    
    return response.json();
  },
  
  getFollows: async () => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/users/follows`, {
      headers: { 
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to get follows');
    }
    
    return response.json();
  },
  
  getUser: async (userId) => {
    const response = await fetch(`${API_URL}/users/${userId}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to get user');
    }
    
    return response.json();
  }
};

// WebSocket服务（弹幕实时通信）
export const createCommentSocket = (streamId, onComment) => {
  const socket = new WebSocket(SOCKET_URL);
  
  socket.onopen = () => {
    console.log('WebSocket connected');
    socket.send(JSON.stringify({
      type: 'joinStream',
      streamId
    }));
  };
  
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'comment') {
      onComment(data.data);
    }
  };
  
  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
  
  socket.onclose = () => {
    console.log('WebSocket disconnected');
  };
  
  const sendComment = (comment) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'newComment',
        comment
      }));
    }
  };
  
  return {
    socket,
    sendComment,
    close: () => socket.close()
  };
};

// WebSocket服务（创建流媒体通信）
export const createStreamSocket = () => {
  const socket = new WebSocket(SOCKET_URL);
  
  socket.onopen = () => {
    console.log('WebSocket connected');
  };
  
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'comment') {
    }
  };
  
  socket.onerror = (error) => {
    console.error('WebSocket error: 流媒体失败', error);
  };
  
  socket.onclose = () => {
    console.log('WebSocket disconnected: 流媒体关闭');
  };
  
  const sendStream = (stream) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'stream',
        stream
      }));
    }
  };
  
  return {
    socket,
    sendStream,
    close: () => socket.close()
  };
};
