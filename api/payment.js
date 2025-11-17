// 🔐 БЕЗОПАСНОЕ ИСПОЛЬЗОВАНИЕ ПЕРЕМЕННЫХ ОКРУЖЕНИЯ
const API_KEY = process.env.QR_API_KEY;

// 🔥 ХРАНИЛИЩЕ ДЛЯ СООТВЕТСТВИЯ OPERATION_ID -> CALLBACK_ID
const paymentMappings = new Map();

// 🔥 ФУНКЦИЯ ДЛЯ ПРОВЕРКИ СТАТУСА ПЛАТЕЖА
async function checkPaymentStatus(operationId) {
  try {
    console.log(`🔍 Comprehensive status check for operation: ${operationId}`);
    
    // 🔥 ПРОВЕРЯЕМ, ЕСТЬ ЛИ СООТВЕТСТВИЕ С CALLBACK ID
    const callbackId = paymentMappings.get(operationId);
    if (callbackId) {
      console.log(`🎯 Found callback mapping: ${operationId} -> ${callbackId}`);
      console.log(`🔄 Checking status via callback ID: ${callbackId}`);
      
      const callbackStatus = await checkStatusById(callbackId);
      if (callbackStatus) {
        return callbackStatus;
      }
    }
    
    // 🔥 ЕСЛИ НЕТ CALLBACK, ПРОВЕРЯЕМ ЧЕРЕЗ ОБЫЧНЫЕ ENDPOINT'Ы
    const endpoints = [
      {
        url: `https://app.wapiserv.qrm.ooo/operations/${operationId}/qr-status/`,
        name: 'qr-status'
      },
      {
        url: `https://app.wapiserv.qrm.ooo/operations/${operationId}/status/`,
        name: 'status'
      },
      {
        url: `https://app.wapiserv.qrm.ooo/operations/${operationId}/`,
        name: 'operations'
      },
      {
        url: `https://app.wapiserv.qrm.ooo/operations/?search=${operationId}`,
        name: 'operations-search'
      }
    ];
    
    let successfulResponse = null;
    
    // Пробуем все endpoint'ы по очереди
    for (const endpoint of endpoints) {
      try {
        console.log(`🔄 Trying endpoint: ${endpoint.name}`);
        
        const response = await fetch(endpoint.url, {
          method: "GET",
          headers: {
            "accept": "application/json",
            "X-Api-Key": API_KEY
          }
        });
        
        console.log(`📊 ${endpoint.name} Response: ${response.status}`);
        
        if (response.ok) {
          const data = await response.json();
          console.log(`✅ ${endpoint.name} success`);
          successfulResponse = { data, endpoint: endpoint.name };
          break;
        }
      } catch (error) {
        console.log(`💥 ${endpoint.name} error: ${error.message}`);
      }
    }
    
    if (!successfulResponse) {
      return { 
        success: false, 
        status: 'api_error',
        error: 'All API endpoints failed'
      };
    }
    
    const { data, endpoint } = successfulResponse;
    
    // 🔥 АНАЛИЗИРУЕМ ДАННЫЕ
    let statusCode = null;
    let statusMsg = null;
    let paymentData = null;
    
    if (endpoint === 'operations-search') {
      if (data.results && data.results.length > 0) {
        const operation = data.results.find(op => 
          op.operation_id === operationId || op.id === operationId
        );
        if (operation) {
          paymentData = operation;
          statusCode = operation.status || operation.operation_status;
          statusMsg = operation.status_msg || operation.message;
        }
      }
    } else if (data.results) {
      paymentData = data.results;
      statusCode = data.results.operation_status_code || data.results.status_code;
      statusMsg = data.results.operation_status_msg || data.results.status_msg;
    } else {
      paymentData = data;
      statusCode = data.operation_status_code || data.status_code || data.status;
      statusMsg = data.operation_status_msg || data.status_msg || data.message;
    }
    
    console.log(`📋 Status: ${statusCode}, Message: "${statusMsg}"`);
    
    // 🔥 ПРОВЕРКА СТАТУСОВ
    const successStatuses = [5, '5', 'success', 'paid', 'completed'];
    
    if (successStatuses.includes(statusCode)) {
      console.log('🎉 PAYMENT SUCCESSFUL!');
      return { 
        success: true, 
        status: 'paid',
        statusCode: statusCode,
        message: statusMsg || 'Payment successful',
        data: paymentData,
        endpoint: endpoint
      };
    } else {
      console.log(`❌ PAYMENT PENDING - Status: ${statusCode}`);
      return { 
        success: false, 
        status: 'pending',
        statusCode: statusCode,
        message: statusMsg || 'Payment pending',
        data: paymentData,
        endpoint: endpoint
      };
    }
    
  } catch (error) {
    console.error('💥 Error checking payment status:', error);
    return { 
      success: false, 
      status: 'error',
      error: error.message 
    };
  }
}

// 🔥 ФУНКЦИЯ ДЛЯ ПРОВЕРКИ ПО CALLBACK ID
async function checkStatusById(callbackId) {
  try {
    console.log(`🔍 Checking via callback ID: ${callbackId}`);
    
    const endpoints = [
      `https://app.wapiserv.qrm.ooo/operations/${callbackId}/qr-status/`,
      `https://app.wapiserv.qrm.ooo/operations/${callbackId}/status/`,
      `https://app.wapiserv.qrm.ooo/operations/${callbackId}/`
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "GET",
          headers: {
            "accept": "application/json",
            "X-Api-Key": API_KEY
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log(`✅ Callback check success for ${callbackId}`);
          
          let statusCode = null;
          let paymentData = null;
          
          if (data.results) {
            paymentData = data.results;
            statusCode = data.results.operation_status_code;
          } else {
            paymentData = data;
            statusCode = data.operation_status_code;
          }
          
          if (statusCode === 5) {
            console.log('🎉 PAYMENT SUCCESSFUL via callback ID!');
            return { 
              success: true, 
              status: 'paid',
              statusCode: statusCode,
              message: 'Payment successful via callback',
              data: paymentData,
              fromCallback: true
            };
          }
        }
      } catch (error) {
        console.log(`Callback check error for ${endpoint}:`, error.message);
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error checking by callback ID:', error);
    return null;
  }
}

module.exports = async (req, res) => {
  console.log('=== CREATIUM QR PAYMENT HANDLER ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);

  // Игнорируем запросы к favicon
  if (req.url.includes('favicon') || req.url.includes('.png') || req.url.includes('.ico')) {
    return res.status(404).json({ error: 'Not found' });
  }

  // Настраиваем CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Обрабатываем OPTIONS запрос
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Проверяем что API ключ загружен
  if (!API_KEY) {
    console.error('QR_API_KEY is not set');
    return res.status(500).json({ success: false, error: 'API key not configured' });
  }

  console.log('API Key loaded:', API_KEY ? '***' + API_KEY.slice(-4) : 'NOT SET');

  // 🔥 ОБРАБОТКА CALLBACK ОТ ПЛАТЕЖНОЙ СИСТЕМЫ
  if (req.method === 'POST' && req.url.includes('/callback')) {
    try {
      console.log('💰 Payment callback received');
      
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      
      console.log('📨 Callback raw body:', body);
      
      let callbackData = {};
      if (body && body.trim() !== '') {
        try {
          callbackData = JSON.parse(body);
          console.log('✅ Callback data parsed:', JSON.stringify(callbackData, null, 2));
          
          // 🔥 ПОЛУЧАЕМ ID ИЗ CALLBACK И OPERATION_ID ИЗ URL
          const callbackId = callbackData.id;
          const urlParams = new URLSearchParams(req.url.split('?')[1]);
          const operationId = urlParams.get('operation_id') || urlParams.get('order_id');
          
          if (callbackId && operationId) {
            console.log(`💾 Saving payment mapping: ${operationId} -> ${callbackId}`);
            paymentMappings.set(operationId, callbackId);
            
            // 🔥 ЕСЛИ СТАТУС 5 - СРАЗУ ОТМЕЧАЕМ КАК УСПЕШНЫЙ
            if (callbackData.operation_status_code === 5) {
              console.log('🎉 CALLBACK: Payment successful! Status 5 received');
              // Можно также сохранить в базе данных или другом хранилище
            }
          }
          
        } catch (parseError) {
          console.error('❌ Callback JSON parse error:', parseError);
        }
      }
      
      return res.status(200).json({ success: true, message: 'Callback received' });
      
    } catch (error) {
      console.error('💥 Callback error:', error);
      return res.status(200).json({ success: false, error: error.message });
    }
  }

  // 🔥 ОБРАБОТКА ПРОВЕРКИ СТАТУСА ПЛАТЕЖА
  if (req.method === 'POST' && req.url.includes('/check-status')) {
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      
      const { operationId } = JSON.parse(body);
      console.log(`🔍 Status check requested for operation: ${operationId}`);
      
      if (!operationId) {
        return res.status(400).json({ success: false, error: 'Operation ID required' });
      }
      
      // 🔥 ПРОВЕРЯЕМ СТАТУС С УЧЕТОМ CALLBACK MAPPING
      const statusResult = await checkPaymentStatus(operationId);
      console.log(`📋 Status result:`, statusResult);
      
      return res.status(200).json(statusResult);
      
    } catch (error) {
      console.error('💥 Status check error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // 🔥 ОБРАБОТКА POST ОТ CREATIUM
  if (req.method === 'POST' && !req.url.includes('/callback') && !req.url.includes('/check-status')) {
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      
      console.log('📨 Raw body from Creatium, length:', body.length);

      let data = {};
      if (body && body.trim() !== '') {
        try {
          data = JSON.parse(body);
          console.log('✅ Parsed Creatium data');
        } catch (parseError) {
          throw new Error('Invalid JSON from Creatium');
        }
      }
      
      const amountInRub = data.payment?.amount || data.cart?.subtotal || 100;
      const amountForQR = Math.round(amountInRub * 100);
      const paymentId = data.payment?.id || `creatium_${Date.now()}`;
      const orderId = data.order?.id || 'unknown';
      
      const successUrl = `https://perevod-rus.ru/payment-success?order_id=${orderId}&payment_id=${paymentId}&status=success&paid=true`;
      const failUrl = `https://perevod-rus.ru/payment-failed?order_id=${orderId}&status=failed&paid=false`;

      // 🔥 ГЕНЕРИРУЕМ QR КОД
      const payload = {
        sum: amountForQR,
        qr_size: 400,
        payment_purpose: "Оплата услуг перевода с иностранных языков",
        notification_url: `https://creatium-qr.vercel.app/api/callback?order_id=${orderId}&operation_id=${paymentId}`
      };

      console.log('🚀 Generating QR code...');
      const qrResponse = await fetch("https://app.wapiserv.qrm.ooo/operations/qr-code/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": API_KEY
        },
        body: JSON.stringify(payload)
      });

      if (!qrResponse.ok) {
        throw new Error(`QR service error: ${qrResponse.status}`);
      }

      const qrResult = await qrResponse.json();
      console.log('✅ QR generated');
      
      const operationId = qrResult.results?.operation_id || paymentId;
      console.log('🎯 Operation ID:', operationId);

      // 🔥 СОЗДАЕМ СТРАНИЦУ С УЧЕТОМ CALLBACK MAPPING
      const htmlForm = createEnhancedPaymentPage(orderId, operationId, paymentId, amountInRub, qrResult.results.qr_img, successUrl, failUrl);
      
      const response = {
        success: true,
        form: htmlForm,
        url: `https://creatium-qr.vercel.app/?sum=${amountInRub}&order_id=${orderId}&operation_id=${operationId}`,
        amount: amountInRub,
        order_id: orderId,
        payment_id: paymentId,
        operation_id: operationId
      };

      console.log('✅ Response to Creatium');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json(response);

    } catch (error) {
      console.error('❌ Payment processing error:', error);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json({
        success: false,
        error: error.message
      });
    }
  }

  // 🔥 ОБРАБОТКА GET ЗАПРОСА
  if (req.method === 'GET' && !req.url.includes('favicon') && !req.url.includes('.png')) {
    try {
      const urlParams = new URLSearchParams(req.url.split('?')[1]);
      const sum = urlParams.get('sum');
      const order_id = urlParams.get('order_id');
      const operation_id = urlParams.get('operation_id');

      console.log('GET request:', { sum, order_id, operation_id });

      if (sum && order_id && operation_id) {
        console.log('Generating payment page with callback support');
        
        const amountInRub = parseFloat(sum);
        const successUrl = `https://perevod-rus.ru/payment-success?order_id=${order_id}&operation_id=${operation_id}&status=success&paid=true`;
        const failUrl = `https://perevod-rus.ru/payment-failed?order_id=${order_id}&status=failed&paid=false`;

        // Генерируем QR код
        const amountForQR = Math.round(amountInRub * 100);
        const payload = {
          sum: amountForQR,
          qr_size: 400,
          payment_purpose: "Оплата услуг перевода с иностранных языков",
          notification_url: `https://creatium-qr.vercel.app/api/callback?order_id=${order_id}&operation_id=${operation_id}`
        };

        const qrResponse = await fetch("https://app.wapiserv.qrm.ooo/operations/qr-code/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": API_KEY
          },
          body: JSON.stringify(payload)
        });

        if (!qrResponse.ok) {
          throw new Error(`QR service error: ${qrResponse.status}`);
        }

        const qrResult = await qrResponse.json();
        
        const html = createEnhancedPaymentPage(order_id, operation_id, 'from_get', amountInRub, qrResult.results.qr_img, successUrl, failUrl);
        
        res.setHeader('Content-Type', 'text/html');
        return res.status(200).send(html);
      }

      // Простой тест для GET без параметров
      const amountInRub = parseFloat(sum || '100');
      const amountForQR = Math.round(amountInRub * 100);
      const payload = {
        sum: amountForQR,
        qr_size: 400,
        payment_purpose: "Оплата услуг перевода с иностранных языков",
        notification_url: 'https://creatium-qr.vercel.app/api/callback'
      };

      const qrResponse = await fetch("https://app.wapiserv.qrm.ooo/operations/qr-code/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": API_KEY
        },
        body: JSON.stringify(payload)
      });

      if (!qrResponse.ok) {
        throw new Error(`QR service error: ${qrResponse.status}`);
      }

      const qrResult = await qrResponse.json();
      const operationId = qrResult.results?.operation_id || `test_${Date.now()}`;
      const successUrl = `https://perevod-rus.ru/payment-success?order_id=${order_id || 'test'}&operation_id=${operationId}&status=success&paid=true`;
      const failUrl = `https://perevod-rus.ru/payment-failed?order_id=${order_id || 'test'}&status=failed&paid=false`;

      const html = createEnhancedPaymentPage(order_id || 'test', operationId, 'test', amountInRub, qrResult.results.qr_img, successUrl, failUrl);

      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(html);

    } catch (error) {
      console.error('GET Error:', error);
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(`<html><body><h2>Error: ${error.message}</h2></body></html>`);
    }
  }

  return res.status(404).json({ error: 'Not found' });
};

// 🔥 ФУНКЦИЯ СОЗДАНИЯ СТРАНИЦЫ
function createEnhancedPaymentPage(orderId, operationId, paymentId, amountInRub, qrImage, successUrl, failUrl) {
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Оплата заказа #${orderId}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
        .container { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); text-align: center; }
        h1 { color: #2c3e50; margin-bottom: 20px; }
        .amount { font-size: 32px; font-weight: bold; color: #27ae60; margin: 20px 0; }
        .qr-code { max-width: 100%; border: 2px solid #3498db; border-radius: 10px; padding: 10px; background: white; }
        .instructions { background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: left; }
        .order-info { background: #fff3cd; padding: 10px; border-radius: 5px; margin: 10px 0; color: #856404; }
        .status-message { padding: 15px; border-radius: 8px; margin: 20px 0; }
        .status-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .status-pending { background: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
        .status-callback { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
        .checking-status { background: #e3f2fd; color: #1976d2; padding: 10px; border-radius: 5px; margin: 10px 0; }
        .button { padding: 12px 24px; border: none; border-radius: 6px; font-size: 16px; cursor: pointer; margin: 10px 5px; text-decoration: none; display: inline-block; }
        .button-success { background: #27ae60; color: white; }
        .button-check { background: #3498db; color: white; }
        .button-cancel { background: #e74c3c; color: white; }
        .debug-info { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 10px 0; font-size: 12px; color: #6c757d; text-align: left; border: 1px dashed #dee2e6; }
        .log-container { background: #2c3e50; color: #ecf0f1; padding: 10px; border-radius: 5px; margin: 10px 0; font-family: monospace; font-size: 11px; text-align: left; max-height: 200px; overflow-y: auto; }
    </style>
</head>
<body>
    <div class="container">
        <h1>💳 Оплата заказа #${orderId}</h1>
        
        <div class="order-info">
            <strong>Operation ID:</strong> ${operationId}<br>
            <strong>Order ID:</strong> ${orderId}<br>
            <small>Система автоматически отслеживает callback</small>
        </div>
        
        <div class="amount">${amountInRub} руб.</div>
        
        <img src="${qrImage}" alt="QR Code" class="qr-code">
        
        <div class="instructions">
            <strong>🚀 Умная система проверки статуса</strong><br>
            • Отсканируйте QR-код и оплатите<br>
            • Система отслеживает callback от платежной системы<br>
            • <strong>Авто-возврат при получении статуса "5"</strong>
        </div>

        <!-- Логи в реальном времени -->
        <div class="debug-info">
            <strong>📊 Логи проверки статуса:</strong>
            <div id="logContainer" class="log-container">
> 🚀 Запуск умного мониторинга...
> 🎯 Operation ID: ${operationId}
> 🔄 Отслеживание callback + API проверка
> ⏰ Интервал: 10 секунд
            </div>
        </div>

        <!-- Статус проверки -->
        <div id="checkingStatus" class="checking-status">
            🔍 Первая проверка через 3 секунды...
        </div>

        <!-- Сообщения о статусе -->
        <div id="successMessage" class="status-message status-success" style="display: none;">
            ✅ <strong>ОПЛАЧЕНО! Статус: 5</strong><br>
            <div id="countdown" class="checking-status" style="margin: 10px 0;">
                Авто-возврат через: <span id="timer">5</span> сек
            </div>
        </div>

        <div id="callbackMessage" class="status-message status-callback" style="display: none;">
            🔔 <strong>CALLBACK ПОЛУЧЕН! Ожидание подтверждения...</strong><br>
            <small>Платежная система сообщила об оплате. Проверяем статус...</small>
        </div>

        <div id="pendingMessage" class="status-message status-pending" style="display: none;">
            ⏳ <strong>ОЖИДАНИЕ ОПЛАТЫ</strong><br>
            <small>Текущий статус: <span id="statusInfo">проверяем...</span></small>
        </div>

        <!-- Отладочная информация -->
        <div class="debug-info">
            <strong>🔧 Информация для отладки:</strong><br>
            • Operation ID: <code>${operationId}</code><br>
            • Order ID: ${orderId}<br>
            • Сумма: ${amountInRub} руб.<br>
            • <strong>Требуется статус: 5 (Оплачено)</strong><br>
            • <strong>Проверки: <span id="checkCount">0</span></strong><br>
            • Callback ID: <span id="callbackId">не получен</span><br>
            • Последний код: <span id="lastStatusCode">не проверен</span>
        </div>

        <!-- Кнопки управления -->
        <div style="margin-top: 20px;">
            <button id="checkStatusBtn" class="button button-check">🔄 Проверить статус</button>
            <a href="${successUrl}" id="manualSuccessBtn" class="button button-success">✅ Я оплатил</a>
            <a href="${failUrl}" class="button button-cancel">❌ Отмена</a>
        </div>
    </div>

    <script>
        const operationId = '${operationId}';
        const successUrl = '${successUrl}';
        
        let checkInterval;
        let checkCount = 0;
        let callbackReceived = false;
        let callbackId = 'не получен';

        // Элементы DOM
        const checkingStatus = document.getElementById('checkingStatus');
        const successMessage = document.getElementById('successMessage');
        const callbackMessage = document.getElementById('callbackMessage');
        const pendingMessage = document.getElementById('pendingMessage');
        const countdown = document.getElementById('countdown');
        const timer = document.getElementById('timer');
        const statusInfo = document.getElementById('statusInfo');
        const checkStatusBtn = document.getElementById('checkStatusBtn');
        const manualSuccessBtn = document.getElementById('manualSuccessBtn');
        const logContainer = document.getElementById('logContainer');
        const checkCountElement = document.getElementById('checkCount');
        const lastStatusCodeElement = document.getElementById('lastStatusCode');
        const callbackIdElement = document.getElementById('callbackId');

        // Функция для добавления логов
        function addLog(message) {
            const timestamp = new Date().toLocaleTimeString();
            logContainer.innerHTML += '> [' + timestamp + '] ' + message + '\\n';
            logContainer.scrollTop = logContainer.scrollHeight;
            console.log(message);
        }

        // Функция проверки статуса платежа
        async function checkPaymentStatus() {
            checkCount++;
            checkCountElement.textContent = checkCount;
            
            try {
                checkingStatus.style.display = 'block';
                checkingStatus.textContent = '🔍 Проверяем статус...';
                addLog('Проверка #' + checkCount);
                
                const response = await fetch('/api/check-status', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        operationId: operationId
                    })
                });
                
                const result = await response.json();
                
                // Обновляем информацию
                const lastStatusCode = result.statusCode || result.status || 'unknown';
                lastStatusCodeElement.textContent = lastStatusCode;
                
                if (result.fromCallback) {
                    callbackId = result.data?.id || 'из callback';
                    callbackIdElement.textContent = callbackId;
                    callbackReceived = true;
                    callbackMessage.style.display = 'block';
                    addLog('🔔 Проверка через callback ID: ' + callbackId);
                }
                
                addLog('📊 Ответ: статус ' + result.status + ', код: ' + lastStatusCode);
                
                checkingStatus.style.display = 'none';
                
                if (result.success && result.status === 'paid') {
                    // 🔥 ПЛАТЕЖ УСПЕШЕН
                    addLog('🎉 ОПЛАЧЕНО! Статус 5 обнаружен!');
                    showSuccess(result.message, result.data);
                } else if (callbackReceived) {
                    // 🔥 CALLBACK ПОЛУЧЕН, НО СТАТУС ЕЩЕ НЕ ОБНОВИЛСЯ
                    addLog('🔔 Callback получен, ожидание подтверждения...');
                    showCallbackPending();
                } else {
                    // 🔥 ОЖИДАНИЕ ОПЛАТЫ
                    addLog('⏳ Ожидание оплаты. Код: ' + lastStatusCode);
                    showPending(lastStatusCode, result.message);
                }
                
            } catch (error) {
                console.error('Status check failed:', error);
                addLog('💥 Ошибка проверки: ' + error.message);
                checkingStatus.style.display = 'none';
                showPending('error', 'Ошибка проверки');
            }
        }

        // Показать успешный статус
        function showSuccess(message, data) {
            successMessage.style.display = 'block';
            callbackMessage.style.display = 'none';
            pendingMessage.style.display = 'none';
            checkStatusBtn.style.display = 'none';
            manualSuccessBtn.style.display = 'none';
            
            statusInfo.textContent = message || 'Оплачено';
            
            // Остановить проверку
            if (checkInterval) {
                clearInterval(checkInterval);
                addLog('✅ Останавливаем проверку');
            }
            
            // Запустить авто-редирект
            startAutoRedirect();
        }

        // Показать ожидание callback
        function showCallbackPending() {
            successMessage.style.display = 'none';
            callbackMessage.style.display = 'block';
            pendingMessage.style.display = 'none';
            statusInfo.textContent = 'Callback получен, проверяем статус...';
        }

        // Показать ожидание
        function showPending(statusCode, statusMsg) {
            successMessage.style.display = 'none';
            callbackMessage.style.display = 'none';
            pendingMessage.style.display = 'block';
            statusInfo.textContent = 'код ' + statusCode + ' - ' + (statusMsg || 'не оплачено');
        }

        // Автоматическое перенаправление
        function startAutoRedirect() {
            let seconds = 5;
            addLog('🔄 Авто-редирект через ' + seconds + ' сек...');
            const countdownInterval = setInterval(() => {
                seconds--;
                timer.textContent = seconds;
                
                if (seconds <= 0) {
                    clearInterval(countdownInterval);
                    addLog('🔄 Выполняем редирект...');
                    window.location.href = successUrl;
                }
            }, 1000);
        }

        // Начать автоматическую проверку
        function startAutoCheck() {
            // Первая проверка через 3 секунды
            setTimeout(() => {
                checkPaymentStatus();
                // Дальнейшие проверки каждые 10 секунд
                checkInterval = setInterval(checkPaymentStatus, 10000);
            }, 3000);
        }

        // Ручная проверка по кнопке
        checkStatusBtn.addEventListener('click', checkPaymentStatus);

        // Запуск при загрузке
        addLog('🚀 Запуск умного мониторинга...');
        addLog('🎯 Operation ID: ' + operationId);
        addLog('🔔 Отслеживание callback + API проверка');
        startAutoCheck();

    </script>
</body>
</html>
  `;
}
