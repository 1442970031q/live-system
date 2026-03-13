/**
 * 敏感词列表页
 * 筛选栏、数据表格、新增/编辑弹窗、批量导入、热更新
 */
import React, { useState, useEffect } from 'react';
import { Table, Button, Input, Select, Space, Modal, Form, message } from 'antd';
import { PlusOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons';
import { sensitiveAPI } from '../../services/api';

const List = () => {
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [batchModalVisible, setBatchModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [batchForm] = Form.useForm();
  const [filters, setFilters] = useState({ page: 1, pageSize: 20, sortBy: 'id', sortOrder: 'DESC' });
  const [keywordInput, setKeywordInput] = useState('');

  const loadCategories = async () => {
    try {
      const data = await sensitiveAPI.getCategories();
      setCategories(data);
    } catch (e) {
      message.error(e.message);
    }
  };

  const loadList = async () => {
    setLoading(true);
    try {
      const data = await sensitiveAPI.getWords(filters);
      setList(data.list);
      setTotal(data.total);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    loadList();
  }, [filters.page, filters.pageSize, filters.categoryId, filters.enabled, filters.keyword]);

  const handleSearch = () => setFilters((f) => ({ ...f, keyword: keywordInput || undefined, page: 1 }));

  const handleAdd = () => {
    setEditingId(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingId(record.id);
    form.setFieldsValue({ category_id: record.category_id, word: record.word });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingId) {
        await sensitiveAPI.updateWord(editingId, values);
        message.success('更新成功');
      } else {
        await sensitiveAPI.createWord(values);
        message.success('新增成功');
      }
      setModalVisible(false);
      loadList();
    } catch (e) {
      if (e.errorFields) return;
      message.error(e.message);
    }
  };

  const handleToggle = async (record) => {
    try {
      await sensitiveAPI.toggleWord(record.id, record.enabled ? 0 : 1);
      message.success('操作成功');
      loadList();
    } catch (e) {
      message.error(e.message);
    }
  };

  const handleHotReload = async () => {
    try {
      await sensitiveAPI.hotReload();
      message.success('热更新成功');
      loadList();
    } catch (e) {
      message.error(e.message);
    }
  };

  const handleBatchImport = async () => {
    try {
      const values = await batchForm.validateFields();
      const words = values.words
        .split(/[\n,，]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((word) => ({ category_id: values.category_id, word }));
      if (words.length === 0) {
        message.warning('请输入有效词条');
        return;
      }
      await sensitiveAPI.batchImport(words);
      message.success(`成功导入 ${words.length} 条`);
      setBatchModalVisible(false);
      batchForm.resetFields();
      loadList();
    } catch (e) {
      if (e.errorFields) return;
      message.error(e.message);
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    { title: '敏感词', dataIndex: 'word', ellipsis: true },
    { title: '等级', dataIndex: 'level', width: 80 },
    { title: '分类', dataIndex: 'category_name', width: 120 },
    { title: '命中次数', dataIndex: 'hit_count', width: 100 },
    {
      title: '状态',
      dataIndex: 'enabled',
      width: 80,
      render: (v) => (v ? '启用' : '禁用'),
    },
    {
      title: '操作',
      width: 180,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>编辑</Button>
          <Button type="link" size="small" onClick={() => handleToggle(record)}>
            {record.enabled ? '禁用' : '启用'}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Select
          placeholder="分类"
          allowClear
          style={{ width: 140 }}
          onChange={(v) => setFilters((f) => ({ ...f, categoryId: v, page: 1 }))}
        >
          {categories.map((c) => (
            <Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>
          ))}
        </Select>
        <Select
          placeholder="状态"
          allowClear
          style={{ width: 100 }}
          onChange={(v) => setFilters((f) => ({ ...f, enabled: v, page: 1 }))}
        >
          <Select.Option value={1}>启用</Select.Option>
          <Select.Option value={0}>禁用</Select.Option>
        </Select>
        <Input
          placeholder="关键词"
          style={{ width: 160 }}
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
          onPressEnter={handleSearch}
        />
        <Button onClick={handleSearch}>搜索</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增</Button>
        <Button icon={<UploadOutlined />} onClick={() => setBatchModalVisible(true)}>批量导入</Button>
        <Button icon={<ReloadOutlined />} onClick={handleHotReload}>热更新</Button>
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
      <Modal
        title={editingId ? '编辑敏感词' : '新增敏感词'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="category_id" label="分类" rules={[{ required: true }]}>
            <Select placeholder="选择分类">
              {categories.map((c) => (
                <Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="word" label="敏感词" rules={[{ required: true }]}>
            <Input placeholder="请输入敏感词" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="批量导入"
        open={batchModalVisible}
        onOk={handleBatchImport}
        onCancel={() => setBatchModalVisible(false)}
        width={500}
      >
        <Form form={batchForm} layout="vertical">
          <Form.Item name="category_id" label="分类" rules={[{ required: true }]}>
            <Select placeholder="选择分类">
              {categories.map((c) => (
                <Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="words" label="词条（每行一个或逗号分隔）" rules={[{ required: true }]}>
            <Input.TextArea rows={8} placeholder="每行一个敏感词，或使用逗号分隔" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default List;
