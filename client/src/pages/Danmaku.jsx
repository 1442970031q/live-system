import React, { useState, useEffect, useRef } from "react";
import { commentAPI } from "../services/api";
import "./Danmaku.css";
const FILTER_IDS =[]
const Danmaku = ({ streamId }) => {
  const [messages, setMessages] = useState([]);
  const totalRows = 6; // 固定6行展示弹幕
  const [rowIndex, setRowIndex] = useState(0);
  const [comments, setComments] = useState([]);
  const intervalIdRef = useRef(null);

  const fetchComments = async (streamId) => {
    try {
      const data = await commentAPI.getComments(streamId);
      const filterData = data.filter(v => !FILTER_IDS.includes(v.id))
      if(JSON.stringify(filterData) === JSON.stringify(comments)){
        return
      }
      setComments((pre) => ([...pre, ...filterData]));
    } catch (err) {
      console.error("Failed to fetch comments:", err);
    }
  };
  useEffect(() => {
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
    }
    intervalIdRef.current = setInterval(() => {
      fetchComments(streamId);
    }, 8000);
    return () => clearInterval(intervalIdRef.current);
  }, [streamId]);
  // 计算下一行位置（固定行，循环使用）
  const getRowPosition = () => {
    const rowHeight = 100 / totalRows;
    const position = rowHeight * rowIndex + rowHeight / 2;
    setRowIndex((prev) => (prev + 1) % totalRows);
    return position;
  };

  // 添加新弹幕
  const addDanmaku = (id, text, color, speed) => {
    const position = getRowPosition();

    // 创建新弹幕对象
    const newDanmaku = {
      id,
      text,
      color,
      speed,
      position,
    };

    // 添加到弹幕列表
    setMessages((prev) => [...prev, newDanmaku]);

    // 弹幕动画结束后移除（只展示一次）
    setTimeout(() => {
      setMessages((prev) => prev.filter((item) => item.id !== id));
      FILTER_IDS.push(id)
    }, speed * 1000);
  };

  // 示例弹幕颜色
  const demoColors = [
    "#ffffff",
    "#ff0000",
    "#00ff00",
    "#00ffff",
    "#ffff00",
    "#ff00ff",
    "#0000ff",
    "#ff9900",
  ];

  // 定时添加新弹幕
  useEffect(() => {
    const demoTexts = comments;
    let temp = demoTexts;
    const timer = setInterval(() => {
      if (temp.length === 0) {
        clearInterval(timer);
        return;
      }
      const index = Math.floor(Math.random() * demoTexts.length);
      const { content: randomText, id } = demoTexts[index];
      temp.splice(index, 1);
      const randomColor =
        demoColors[Math.floor(Math.random() * demoColors.length)];
      const randomSpeed = 5 + Math.floor(Math.random() * 6); // 5-10秒

      addDanmaku(id, randomText, randomColor, randomSpeed);
    });

    // 组件卸载时清理定时器
    return () => clearInterval(timer);
  }, [comments]);

  return (
    <div className="danmaku-container">
      <div className="danmaku-screen">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className="danmaku-item"
            style={{
              top: `${msg.position}%`,
              color: msg.color,
              animationDuration: `${msg.speed}s`,
            }}
          >
            {msg.text}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Danmaku;
