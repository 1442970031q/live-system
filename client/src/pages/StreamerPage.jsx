// 主播页面（含直播时主播语音敏感词检测）
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { authAPI, liveAPI, voiceAPI } from '../services/api';

const VOICE_CHUNK_MS = 8000; // 每 8 秒送检一段语音

const StreamerPage = () => {
  const { streamId } = useParams();
  const [stream, setStream] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEnding, setIsEnding] = useState(false);
  const [voiceCheckOn, setVoiceCheckOn] = useState(false);
  const [voiceCheckError, setVoiceCheckError] = useState('');
  const [sensitivePopup, setSensitivePopup] = useState({ show: false, matchedWords: [] });
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const navigate = useNavigate();
  const currentUser = authAPI.getCurrentUser();

  // 直播时主播语音敏感词检测：采集麦克风，按段送检
  useEffect(() => {
    if (!voiceCheckOn) return;

    let mediaRecorder = null;
    let stream = null;

    const startVoiceCheck = async () => {
      setVoiceCheckError('');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = async (e) => {
          if (!e.data?.size) return;
          try {
            const result = await voiceAPI.checkAudio(e.data);
            if (result.containsSensitive && result.matchedWords?.length) {
              setSensitivePopup({ show: true, matchedWords: result.matchedWords });
            }
          } catch (err) {
            if (err.matchedWords?.length) {
              setSensitivePopup({ show: true, matchedWords: err.matchedWords });
            } else {
              setVoiceCheckError(err.message || '语音检测异常');
            }
          }
        };

        mediaRecorder.start(VOICE_CHUNK_MS);
      } catch (err) {
        setVoiceCheckError(err.message || '无法获取麦克风权限');
        setVoiceCheckOn(false);
      }
    };

    startVoiceCheck();
    return () => {
      if (mediaRecorder?.state !== 'inactive') mediaRecorder?.stop();
      mediaRecorderRef.current = null;
      stream?.getTracks?.().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [voiceCheckOn]);

  useEffect(() => {
    // 检查用户是否已登录
    if (!authAPI.isAuthenticated()) {
      navigate('/login');
      return;
    }
    
    const fetchStream = async () => {
      try {
        const data = await liveAPI.getStream(streamId);
        
        // 检查当前用户是否是直播的创建者
        if (data.user_id !== currentUser.id) {
          throw new Error('你没有权限访问此页面');
        }
        
        setStream(data);
      } catch (err) {
        setError(err.message);
        navigate('/');
      } finally {
        setLoading(false);
      }
    };
    
    fetchStream();
  }, [streamId, currentUser, navigate]);
  
  const handleEndStream = async () => {
    if (window.confirm('确定要结束直播吗？')) {
      setIsEnding(true);
      
      try {
        await liveAPI.endStream(streamId);
        navigate('/');
      } catch (err) {
        setError(err.message);
        setIsEnding(false);
      }
    }
  };
  
  if (loading) {
    return <div className="loading">加载中...</div>;
  }
  
  if (error) {
    return <div className="error-message">{error}</div>;
  }
  
  if (!stream) {
    return <div className="error-message">直播不存在</div>;
  }
  
  return (
    <div className="streamer-container">
      <div className="streamer-header">
        <h1>你的直播</h1>
        <button 
          className="end-stream-btn"
          onClick={handleEndStream}
          disabled={isEnding}
        >
          {isEnding ? '结束中...' : '结束直播'}
        </button>
      </div>
      
      <div className="streamer-info">
        <h2>{stream.title}</h2>
        <p>{stream.description}</p>
        <p>直播ID: {stream.id}</p>
        <p>开始时间: {new Date(stream.started_at).toLocaleString()}</p>
      </div>
      
      <div className="streamer-preview">
        <h3>直播预览</h3>
        <div className="stream-preview-placeholder">
          {/* 这里应该是主播的视频预览 */}
          <p>请在直播软件中设置推流地址</p>
          <p>示例推流地址: rtmp://your-server-ip/live/{streamId}</p>
        </div>
      </div>

      <div className="streamer-voice-check">
        <h3>直播语音敏感词检测</h3>
        <p className="streamer-voice-desc">开启后将对您麦克风说话内容进行实时检测，命中敏感词会弹窗提示。</p>
        <button
          type="button"
          className={`voice-check-toggle ${voiceCheckOn ? 'on' : ''}`}
          onClick={() => setVoiceCheckOn((v) => !v)}
        >
          {voiceCheckOn ? '已开启（点击关闭）' : '开启语音敏感词检测'}
        </button>
        {voiceCheckError && <p className="streamer-voice-error">{voiceCheckError}</p>}
      </div>

      {sensitivePopup.show && (
        <div className="sensitive-popup-overlay" onClick={() => setSensitivePopup({ show: false, matchedWords: [] })}>
          <div className="sensitive-popup" onClick={(e) => e.stopPropagation()}>
            <div className="sensitive-popup-title">检测到敏感词</div>
            <p className="sensitive-popup-desc">您刚才的发言中包含敏感词，请注意用语规范。</p>
            <div className="sensitive-popup-words">
              <span>命中词：</span>
              {sensitivePopup.matchedWords.map((w) => (
                <span key={w} className="sensitive-word-tag">{w}</span>
              ))}
            </div>
            <button type="button" className="sensitive-popup-btn" onClick={() => setSensitivePopup({ show: false, matchedWords: [] })}>
              知道了
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StreamerPage;
