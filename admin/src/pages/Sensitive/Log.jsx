/**
 * 违规日志查询页
 * 按用户/直播间/时间/等级筛选、分页、导出
 */
import React, { useState, useEffect } from 'react';
import { Table, Input, Select, DatePicker, Button, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { sensitiveAPI } from '../../services/api';

const Log = () => {
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ page: 1, pageSize: 20 });
  const [userIdInput, setUserIdInput] = useState('');
  const [streamIdInput, setStreamIdInput] = useState('');

  const loadList = async () => {
    setLoading(true);
    try {
      const params = { ...filters };
      const data = await sensitiveAPI.getHitLogs(params);
      setList(data.list);
      setTotal(data.total);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
  }, [filters.page, filters.pageSize, filters.userId, filters.streamId, filters.level, filters.startTime, filters.endTime]);

  const handleSearch = () =>
    setFilters((f) => ({
      ...f,
      userId: userIdInput || undefined,
      streamId: streamIdInput || undefined,
      page: 1,
    }));

  const handleExport = () => {
    const rows = list.map((r) => ({
      时间: r.created_at,
      用户ID: r.user_id,
      用户名: r.username,
      直播间ID: r.stream_id,
      命中等级: r.hit_level,
      命中词: r.matched_word,
      原始内容: r.original_content?.substring(0, 100),
      场景: r.hit_scene,
      处理结果: r.handle_result,
    }));
    const csv = [
      Object.keys(rows[0] || {}).join(','),
      ...rows.map((r) => Object.values(r).map((v) => `"${String(v || '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `违规日志_${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    message.success('导出成功');
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    { title: '时间', dataIndex: 'created_at', width: 180 },
    { title: '用户ID', dataIndex: 'user_id', width: 80 },
    { title: '用户名', dataIndex: 'username', width: 100 },
    { title: '直播间ID', dataIndex: 'stream_id', width: 100 },
    { title: '等级', dataIndex: 'hit_level', width: 80 },
    { title: '命中词', dataIndex: 'matched_word', width: 120 },
    { title: '原始内容', dataIndex: 'original_content', ellipsis: true, render: (v) => (v && v.length > 50 ? v.slice(0, 50) + '...' : v) },
    { title: '场景', dataIndex: 'hit_scene', width: 90 },
    { title: '处理结果', dataIndex: 'handle_result', width: 90 },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Input
          placeholder="用户ID"
          style={{ width: 120 }}
          value={userIdInput}
          onChange={(e) => setUserIdInput(e.target.value)}
        />
        <Input
          placeholder="直播间ID"
          style={{ width: 120 }}
          value={streamIdInput}
          onChange={(e) => setStreamIdInput(e.target.value)}
        />
        <Select
          placeholder="等级"
          allowClear
          style={{ width: 100 }}
          onChange={(v) => setFilters((f) => ({ ...f, level: v, page: 1 }))}
        >
          <Select.Option value={1}>一级</Select.Option>
          <Select.Option value={2}>二级</Select.Option>
          <Select.Option value={3}>三级</Select.Option>
          <Select.Option value={4}>四级</Select.Option>
        </Select>
        <DatePicker
          placeholder="开始时间"
          onChange={(_, dateStr) => setFilters((f) => ({ ...f, startTime: dateStr || undefined, page: 1 }))}
        />
        <DatePicker
          placeholder="结束时间"
          onChange={(_, dateStr) => setFilters((f) => ({ ...f, endTime: dateStr || undefined, page: 1 }))}
        />
        <Button onClick={handleSearch}>搜索</Button>
        <Button icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
      </div>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={list}
        loading={loading}
        pagination={{
          current: filters.page,
          pageSize: filters.pageSize,
          total,
          showSizeChanger: true,
          onChange: (page, pageSize) => setFilters((f) => ({ ...f, page, pageSize })),
        }}
      />
    </div>
  );
};

export default Log;
