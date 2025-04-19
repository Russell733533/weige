const express = require('express');
const cors = require('cors');
const { Vika } = require('@vikadata/vika');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 初始化维格表SDK
const vika = new Vika({ 
  token: process.env.VIKA_TOKEN,
  fieldKey: 'name'
});

const datasheet = vika.datasheet(process.env.DATASHEET_ID);

// 添加延迟函数
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// 带重试的API请求函数
async function retryRequest(fn, maxRetries = 3, initialDelay = 500) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (error.code === 429) { // 如果是频率限制错误
        console.log(`API请求受限，等待重试 (${i + 1}/${maxRetries})`);
        await delay(initialDelay * Math.pow(2, i)); // 指数退避
        continue;
      }
      throw error; // 如果不是频率限制错误，直接抛出
    }
  }
  throw lastError;
}

// 获取所有图书
app.get('/api/books', async (req, res) => {
  try {
    const response = await retryRequest(
      () => datasheet.records.query(),
      3, // 最大重试次数
      500 // 初始延迟时间（毫秒）
    );

    if (response.success) {
      const books = response.data.records.map(record => ({
        id: record.recordId,
        book_name: record.fields.book_name,
        book_status: record.fields.book_status,
        book_location: record.fields.book_location
      }));
      res.json({
        success: true,
        data: books
      });
    } else {
      console.error('API响应不成功:', response);
      throw new Error(response.message || '获取图书列表失败');
    }
  } catch (error) {
    console.error('获取图书列表时出错:', error);
    res.status(error.code === 429 ? 429 : 500).json({
      success: false,
      error: error.code === 429 ? '服务器繁忙，请稍后重试' : (error.message || '服务器内部错误')
    });
  }
});

// 新增图书
app.post('/api/books', async (req, res) => {
  try {
    // 确保请求体存在
    if (!req.body) {
      return res.status(400).json({
        success: false,
        error: '请求体不能为空'
      });
    }

    const { book_name, book_status, book_location } = req.body;
    
    // 验证必填字段
    if (!book_name || !book_status || !book_location) {
      return res.status(400).json({
        success: false,
        error: '所有字段都是必填的'
      });
    }

    // 验证请求体格式
    if (typeof book_name !== 'string' || 
        typeof book_status !== 'string' || 
        typeof book_location !== 'string') {
      return res.status(400).json({
        success: false,
        error: '所有字段必须为字符串类型'
      });
    }

    // 验证book_status的值
    if (!['已被借走', '未被借走'].includes(book_status)) {
      return res.status(400).json({
        success: false,
        error: '图书状态必须是 "已被借走" 或 "未被借走"'
      });
    }

    console.log('创建图书记录:', { book_name, book_status, book_location });

    const response = await retryRequest(
      () => datasheet.records.create([{
        fields: {
          book_name,
          book_status,
          book_location
        }
      }]),
      3,
      500
    );

    if (!response) {
      console.error('维格表API返回空响应');
      throw new Error('添加图书失败');
    }

    if (response.success && response.data && response.data.records && response.data.records[0]) {
      console.log('图书添加成功:', response.data.records[0]);
      return res.json({
        success: true,
        data: response.data.records[0]
      });
    } else {
      console.error('维格表API响应不成功:', response);
      throw new Error(response.message || '添加图书失败');
    }
  } catch (error) {
    console.error('添加图书时出错:', error);
    // 确保错误响应始终是JSON格式
    return res.status(error.code === 429 ? 429 : 500).json({
      success: false,
      error: error.code === 429 ? '服务器繁忙，请稍后重试' : (error.message || '服务器内部错误')
    });
  }
});

// 获取单本图书信息
app.get('/api/books/:id', async (req, res) => {
  try {
    const recordId = req.params.id;
    
    if (!recordId) {
      return res.status(400).json({
        success: false,
        error: '图书ID不能为空'
      });
    }

    const response = await retryRequest(
      () => datasheet.records.get(recordId),
      3,
      500
    );

    if (!response) {
      console.error('维格表API返回空响应');
      throw new Error('获取图书信息失败');
    }

    if (response.success && response.data) {
      res.json({
        success: true,
        data: {
          id: response.data.recordId,
          book_name: response.data.fields.book_name,
          book_status: response.data.fields.book_status,
          book_location: response.data.fields.book_location
        }
      });
    } else {
      console.error('维格表API响应不成功:', response);
      throw new Error(response.message || '获取图书信息失败');
    }
  } catch (error) {
    console.error('获取图书信息时出错:', error);
    const statusCode = error.code === 429 ? 429 : 
                      error.message.includes('找不到') ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.code === 429 ? '服务器繁忙，请稍后重试' : 
            (error.message || '服务器内部错误')
    });
  }
});

// 修改图书信息
app.put('/api/books/:id', async (req, res) => {
  try {
    const recordId = req.params.id;
    
    if (!recordId) {
      return res.status(400).json({
        success: false,
        error: '图书ID不能为空'
      });
    }

    const { book_name, book_status, book_location } = req.body;

    // 验证必填字段
    if (!book_name || !book_status || !book_location) {
      return res.status(400).json({
        success: false,
        error: '所有字段都是必填的'
      });
    }

    // 验证字段类型
    if (typeof book_name !== 'string' || 
        typeof book_status !== 'string' || 
        typeof book_location !== 'string') {
      return res.status(400).json({
        success: false,
        error: '所有字段必须为字符串类型'
      });
    }

    // 先检查图书是否存在
    try {
      const checkResponse = await retryRequest(
        () => datasheet.records.get(recordId),
        3,
        500
      );
      if (!checkResponse.success || !checkResponse.data) {
        return res.status(404).json({
          success: false,
          error: '找不到指定的图书'
        });
      }
    } catch (error) {
      console.error('检查图书存在性时出错:', error);
      return res.status(404).json({
        success: false,
        error: '找不到指定的图书'
      });
    }

    const response = await retryRequest(
      () => datasheet.records.update([
        {
          recordId,
          fields: {
            book_name,
            book_status,
            book_location
          }
        }
      ]),
      3,
      500
    );

    if (!response) {
      console.error('维格表API返回空响应');
      throw new Error('更新图书信息失败');
    }

    if (response.success && response.data && response.data.records && response.data.records[0]) {
      console.log('图书更新成功:', response.data.records[0]);
      res.json({
        success: true,
        data: {
          id: response.data.records[0].recordId,
          book_name: response.data.records[0].fields.book_name,
          book_status: response.data.records[0].fields.book_status,
          book_location: response.data.records[0].fields.book_location
        }
      });
    } else {
      throw new Error('修改图书失败');
    }
  } catch (error) {
    console.error('修改图书时出错:', error);
    res.status(500).json({
      success: false,
      error: error.message || '服务器内部错误'
    });
  }
});

// 删除图书
// 更新图书状态
app.patch('/api/books/:id/status', async (req, res) => {
  try {
    const recordId = req.params.id;
    
    if (!recordId) {
      return res.status(400).json({
        success: false,
        error: '图书ID不能为空'
      });
    }

    const { status } = req.body;

    // 验证状态值
    if (!status || !['已被借走', '未被借走'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: '无效的状态值，必须是 "已被借走" 或 "未被借走"'
      });
    }

    // 先检查图书是否存在
    try {
      const checkResponse = await retryRequest(
        () => datasheet.records.get(recordId),
        3,
        500
      );
      if (!checkResponse.success || !checkResponse.data) {
        return res.status(404).json({
          success: false,
          error: '找不到指定的图书'
        });
      }
    } catch (error) {
      console.error('检查图书存在性时出错:', error);
      return res.status(404).json({
        success: false,
        error: '找不到指定的图书'
      });
    }

    const response = await retryRequest(
      () => datasheet.records.update([
        {
          recordId,
          fields: {
            book_status: status
          }
        }
      ]),
      3,
      500
    );

    if (!response) {
      console.error('维格表API返回空响应');
      throw new Error('更新图书状态失败');
    }

    if (response.success && response.data && response.data.records && response.data.records[0]) {
      console.log('图书状态更新成功:', response.data.records[0]);
      res.json({
        success: true,
        data: {
          id: response.data.records[0].recordId,
          book_name: response.data.records[0].fields.book_name,
          book_status: response.data.records[0].fields.book_status,
          book_location: response.data.records[0].fields.book_location
        }
      });
    } else {
      console.error('维格表API响应不成功:', response);
      throw new Error(response.message || '更新图书状态失败');
    }
  } catch (error) {
    console.error('更新图书状态时出错:', error);
    const statusCode = error.code === 429 ? 429 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.code === 429 ? '服务器繁忙，请稍后重试' : (error.message || '服务器内部错误')
    });
  }
});

app.delete('/api/books/:id', async (req, res) => {
  try {
    // 设置响应头
    res.setHeader('Content-Type', 'application/json');

    const recordId = req.params.id;
    
    // 验证recordId
    if (!recordId) {
      return res.status(400).json({
        success: false,
        error: '图书ID不能为空'
      });
    }

    // 先检查图书是否存在
    try {
      const checkResponse = await datasheet.records.get(recordId);
      if (!checkResponse.success || !checkResponse.data) {
        return res.status(404).json({
          success: false,
          error: '找不到指定的图书'
        });
      }
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: '找不到指定的图书'
      });
    }

    const response = await datasheet.records.delete([recordId]);

    if (response.success) {
      return res.json({
        success: true,
        message: '图书删除成功'
      });
    } else {
      throw new Error('删除图书失败');
    }
  } catch (error) {
    console.error('删除图书时出错:', error);
    // 确保错误响应始终是JSON格式
    return res.status(500).json({
      success: false,
      error: error.message || '服务器内部错误'
    });
  }
});

app.get('/api/books', async (req, res) => {
  try {
    console.log('正在获取图书列表...');
    console.log('使用的ViewID:', process.env.VIEW_ID);

    const response = await datasheet.records.query({
      viewId: process.env.VIEW_ID
    });

    console.log('API响应:', JSON.stringify(response, null, 2));

    if (response.success) {
      const formattedData = response.data.records.map(record => ({
        id: record.recordId,
        ...record.fields
      }));
      console.log('成功获取图书列表，总数:', formattedData.length);
      res.json({
        success: true,
        data: formattedData
      });
    } else {
      console.error('获取图书列表失败:', response);
      throw new Error('获取图书列表失败');
    }
  } catch (error) {
    console.error('获取图书列表时出错:', error);
    res.status(500).json({
      success: false,
      error: error.message || '服务器内部错误'
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});