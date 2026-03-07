// 开播页：仅填写开播信息，提交成功后跳转到主播页
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { authAPI, liveAPI } from "../services/api";
import "./CreateStream.css";

const CreateStream = () => {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (!authAPI.isAuthenticated()) {
      navigate("/login");
    }
  }, [navigate]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await liveAPI.createStream(formData);
      const { streamId } = data;
      navigate(`/streamer/${streamId}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="create-stream-container">
      <div className="create-stream-container-info create-stream-only-form">
        <h2>创建直播</h2>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleSubmit} className="create-stream-form">
          <div className="form-group">
            <label htmlFor="title">直播标题</label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
              placeholder="请输入直播标题"
            />
          </div>
          <div className="form-group">
            <label htmlFor="description">直播描述</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows="4"
              placeholder="请输入直播描述（可选）"
            />
          </div>
          <button type="submit" className="start-stream-btn" disabled={loading}>
            {loading ? "创建中..." : "开始直播"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CreateStream;
