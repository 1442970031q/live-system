/**
 * 用户黑白名单页
 * 列表、添加/移除弹窗、过期时间设置
 */
import React, { useState, useEffect } from 'react';
import { Table, Button, Tabs, Modal, Form, Input, DatePicker, message } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { sensitiveAPI } from '../../services/api';

const WhiteList = () => {
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [listType, setListType] = useState('black');
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [filters, setFilters] = useState({ page: 1, pageSize: 20 });

  const loadList = async () => {
    setLoading(true);
    try {
      const data = await sensitiveAPI.getBlackWhiteList(listType, filters);
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
  }, [listType, filters.page, filters.pageSize]);

  const handleAdd = () => {
    form.resetFields();
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const expireAt = values.expireAt && typeof values.expireAt.format === 'function'
        ? values.expireAt.format('YYYY-MM-DD HH:mm:ss')
        : (values.expireAt ? new Date(values.expireAt).toISOString().slice(0, 19).replace('T', ' ') : null);
      await sensitiveAPI.addBlackWhite({
        userId: values.userId,
        listType,
        reason: values.reason,
        expireAt,
      });
      message.success('添加成功');
      setModalVisible(false);
      loadList();
    } catch (e) {
      if (e.errorFields) return;
      message.error(e.message);
    }
  };

  const handleRemove = async (record) => {
    try {
      await sensitiveAPI.removeBlackWhite(record.user_id, listType);
      message.success('移除成功');
      loadList();
    } catch (e) {
      message.error(e.message);
    }
  };

  const columns = [
    { title: '用户ID', dataIndex: 'user_id', width: 100 },
    { title: '用户名', dataIndex: 'username', width: 120 },
    { title: '原因', dataIndex: 'reason', ellipsis: true },
    { title: '过期时间', dataIndex: 'expire_at', width: 180 },
    { title: '加入时间', dataIndex: 'created_at', width: 180 },
    {
      title: '操作',
      width: 100,
      render: (_, record) => (
        <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => handleRemove(record)}>
          移除
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Tabs
        activeKey={listType}
        onChange={setListType}
        items={[
          { key: 'black', label: '黑名单' },
          { key: 'white', label: '白名单' },
        ]}
      />
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          添加{listType === 'black' ? '黑名单' : '白名单'}
        </Button>
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
        title={`添加${listType === 'black' ? '黑名单' : '白名单'}`}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="userId" label="用户ID" rules={[{ required: true }]}>
            <Input type="number" placeholder="请输入用户ID" />
          </Form.Item>
          <Form.Item name="reason" label="原因">
            <Input.TextArea rows={2} placeholder="选填" />
          </Form.Item>
          <Form.Item name="expireAt" label="过期时间">
            <DatePicker showTime placeholder="不填则永久有效" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default WhiteList;
