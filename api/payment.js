// 🔐 БЕЗОПАСНОЕ ИСПОЛЬЗОВАНИЕ ПЕРЕМЕННЫХ ОКРУЖЕНИЯ
const API_KEY = process.env.QR_API_KEY;

// 🔥 УЛУЧШЕННАЯ ФУНКЦИЯ ДЛЯ ПРОВЕРКИ СТАТУСА ПЛАТЕЖА
async function checkPaymentStatus(operationId) {
  try {
    console.log(`🔍 Checking payment status for operation: ${operationId}`);
    
    // 🔥 ПРОВЕРЯЕМ РАЗНЫЕ ВАРИАНТЫ ENDPOINT'ОВ
    const endpoints = [
      `https://app.wapiserv.qrm.ooo/operations/${operationId}/qr-status/`,
      `https://app.wapiserv.qrm.ooo/operations/${operationId}/status/`,
      `https://app.wapiserv.qrm.ooo/operations/${operationId}/`
    ];
    
    let statusResponse = null;
    let lastError = null;
    
    // Пробуем разные endpoint'ы
    for (const endpoint of endpoints) {
      try {
        console.log(`Trying endpoint: ${endpoint}`);
        statusResponse = await fetch(endpoint, {
          method: "GET",
          headers: {
            "accept": "application/json",
            "X-Api-Key": API_KEY
          }
        });
        
        if (statusResponse.ok) {
          console.log(`✅ Success with endpoint: ${endpoint}`);
          break;
        } else {
          console.log(`❌ Endpoint failed: ${endpoint} - ${statusResponse.status}`);
          lastError = `Endpoint ${endpoint} failed: ${statusResponse.status}`;
        }
      } catch (endpointError) {
        console.log(`❌ Endpoint error: ${endpoint} - ${endpointError.message}`);
        lastError = endpointError.message;
      }
    }
    
    if (!statusResponse || !statusResponse.ok) {
      console.error(`All endpoints failed. Last error: ${lastError}`);
      return { 
        success: false, 
        status: 'api_error',
        error: `All API endpoints failed: ${lastError}`
      };
    }

    console.log(`📊 Status API Response: ${statusResponse.status} ${statusResponse.statusText}`);
    
    const statusData = await statusResponse.json();
    console.log('💳 Payment status API response:', JSON.stringify(statusData, null, 2));
    
    // 🔥 РАСШИРЕННЫЙ АНАЛИЗ СТАТУСА
    let statusCode = null;
    let statusMsg = null;
    
    // Ищем статус в разных местах ответа
    if (statusData.results) {
      statusCode = statusData.results.operation_status_code || statusData.results.status_code;
      statusMsg = statusData.results.operation_status_msg || statusData.results.status_msg;
    } else if (statusData.operation_status_code) {
      statusCode = statusData.operation_status_code;
      statusMsg = statusData.operation_status_msg;
    } else if (statusData.status) {
      statusCode = statusData.status;
      statusMsg = statusData.message;
    }
    
    console.log(`📋 Status Code: ${statusCode}, Message: "${statusMsg}"`);
    console.log(`🔍 Full status data:`, JSON.stringify(statusData, null, 2));
    
    // 🔥 РАСШИРЕННАЯ ПРОВЕРКА СТАТУСОВ
    const successStatuses = [5, '5', 'success', 'paid', 'completed', 'SUCCESS', 'PAID'];
    const pendingStatuses = [3, '3', 'created', 'pending', 'waiting', 'CREATED', 'PENDING'];
    
    if (successStatuses.includes(statusCode)) {
      console.log('🎉 PAYMENT SUCCESSFUL! Status code indicates payment received');
      return { 
        success: true, 
        status: 'paid',
        statusCode: statusCode,
        message: statusMsg || 'Payment successful',
        data: statusData 
      };
    } else if (pendingStatuses.includes(statusCode)) {
      console.log(`⏳ PAYMENT PENDING - Status code: ${statusCode}, Message: "${statusMsg}"`);
      return { 
        success: false, 
        status: 'pending',
        statusCode: statusCode,
        message: statusMsg || 'Payment pending',
        data: statusData 
      };
    } else {
      // 🔥 ВСЕ ДРУГИЕ КОДЫ - НЕ ОПЛАЧЕНО ИЛИ ОШИБКА
      console.log(`❌ PAYMENT NOT DONE or ERROR - Status code: ${statusCode}, Message: "${statusMsg}"`);
      return { 
        success: false, 
        status: 'not_paid',
        statusCode: statusCode,
        message: statusMsg || `Status: ${statusCode}`,
        data: statusData 
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

// 🔥 ФУНКЦИЯ ДЛЯ ПРОВЕРКИ СТАТУСА ЧЕРЕЗ СПИСОК ОПЕРАЦИЙ
async function checkPaymentStatusViaList(operationId) {
  try {
    console.log(`🔍 Trying to find operation in list: ${operationId}`);
    
    const listResponse = await fetch(`https://app.wapiserv.qrm.ooo/operations/?search=${operationId}`, {
      method: "GET",
      headers: {
        "accept": "application/json",
        "X-Api-Key": API_KEY
      }
    });
    
    if (listResponse.ok) {
      const listData = await listResponse.json();
      console.log('📋 Operations list response:', JSON.stringify(listData, null, 2));
      
      if (listData.results && listData.results.length > 0) {
        const operation = listData.results.find(op => 
          op.operation_id === operationId || op.id === operationId
        );
        
        if (operation) {
          console.log('🎯 Found operation in list:', operation);
          return {
            success: true,
            status: 'found_in_list',
            data: operation,
            fromList: true
          };
        }
      }
    }
    
    return { success: false, status: 'not_found_in_list' };
  } catch (error) {
    console.error('Error checking via list:', error);
    return { success: false, status: 'list_error', error: error.message };
  }
}

module.exports = async (req, res) => {
  console.log('=== CREATIUM QR PAYMENT HANDLER ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);

  // Игнорируем запросы к favicon и другим статическим файлам
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
    console.error('QR_API_KEY is not set in environment variables');
    
    const errorHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Ошибка</title></head>
<body style="font-family: Arial; text-align: center; padding: 50px;">
  <h2 style="color: #e74c3c;">❌ Ошибка сервера</h2>
  <p>API ключ не настроен</p>
</body>
</html>
    `;
    
    if (req.method === 'POST') {
      return res.status(200).json({
        success: false,
        form: errorHtml,
        error: 'API key not configured'
      });
    } else {
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(errorHtml);
    }
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
      
      // Парсим callback данные
      let callbackData = {};
      if (body && body.trim() !== '') {
        try {
          callbackData = JSON.parse(body);
          console.log('✅ Callback data parsed:', JSON.stringify(callbackData, null, 2));
        } catch (parseError) {
          console.error('❌ Callback JSON parse error:', parseError);
          console.log('📨 Raw callback body:', body);
        }
      }
      
      // 🔥 ОБРАБАТЫВАЕМ CALLBACK
      const operationId = callbackData.operation_id || callbackData.id;
      const status = callbackData.status || callbackData.payment_status;
      
      console.log(`📊 Callback processed - Operation: ${operationId}, Status: ${status}`);
      
      // Сохраняем callback данные для отладки
      if (operationId) {
        console.log(`💾 Saving callback for operation ${operationId}:`, callbackData);
      }
      
      return res.status(200).json({ success: true, message: 'Callback received', data: callbackData });
      
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
      
      // 🔥 ПРОВЕРЯЕМ СТАТУС РАЗНЫМИ СПОСОБАМИ
      console.log(`🔄 Starting comprehensive status check for: ${operationId}`);
      
      // 1. Основная проверка статуса
      const statusResult = await checkPaymentStatus(operationId);
      console.log(`📊 Main status check result:`, statusResult);
      
      // 2. Если не нашли, проверяем через список операций
      if (!statusResult.success && statusResult.status !== 'paid') {
        console.log(`🔄 Trying alternative check via operations list...`);
        const listResult = await checkPaymentStatusViaList(operationId);
        
        if (listResult.success && listResult.fromList) {
          console.log(`✅ Found operation in list:`, listResult.data);
          // Анализируем данные из списка
          const operationData = listResult.data;
          const operationStatus = operationData.status || operationData.operation_status;
          
          if (operationStatus === 'success' || operationStatus === 'paid' || operationStatus === 5) {
            return res.status(200).json({
              success: true,
              status: 'paid',
              message: 'Payment found in operations list',
              data: operationData,
              fromList: true
            });
          }
        }
      }
      
      console.log(`📋 Final status check result for ${operationId}:`, statusResult);
      return res.status(200).json(statusResult);
      
    } catch (error) {
      console.error('💥 Status check error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // 🔥 ОБРАБОТКА POST ОТ CREATIUM (ОСНОВНОЙ ENDPOINT)
  if (req.method === 'POST' && !req.url.includes('/callback') && !req.url.includes('/check-status')) {
    try {
      let body = '';
      
      // Читаем тело запроса
      for await (const chunk of req) {
        body += chunk;
      }
      
      console.log('📨 Raw body received from Creatium, length:', body.length);

      let data = {};
      if (body && body.trim() !== '') {
        try {
          data = JSON.parse(body);
          console.log('✅ Successfully parsed Creatium JSON data');
        } catch (parseError) {
          console.error('❌ JSON parse error:', parseError);
          throw new Error('Invalid JSON data received from Creatium');
        }
      } else {
        console.log('ℹ️ Empty body received from Creatium, using default data');
      }
      
      console.log('💰 Payment amount:', data.payment?.amount);
      console.log('🛒 Cart subtotal:', data.cart?.subtotal);
      console.log('📦 Order ID:', data.order?.id);
      console.log('💳 Payment ID:', data.payment?.id);

      // 🔥 РАСЧЕТ СУММЫ
      let amountInRub = 100;
      let amountForQR = 10000;
      
      if (data.payment && data.payment.amount) {
        amountInRub = parseFloat(data.payment.amount);
        amountForQR = Math.round(amountInRub * 100);
        console.log('💰 Using payment amount:', amountInRub, 'RUB ->', amountForQR, 'kopecks');
      } else if (data.cart && data.cart.subtotal) {
        amountInRub = data.cart.subtotal;
        amountForQR = Math.round(amountInRub * 100);
        console.log('🛒 Using cart subtotal:', amountInRub, 'RUB ->', amountForQR, 'kopecks');
      } else {
        console.log('ℹ️ Using default amount: 100 RUB');
      }

      // 🔥 СОЗДАЕМ УНИКАЛЬНЫЙ ID ДЛЯ ОПЛАТЫ
      const paymentId = data.payment?.id || `creatium_${Date.now()}`;
      const orderId = data.order?.id || 'unknown';
      
      // 🔥 URL ДЛЯ ВОЗВРАТА
      const successUrl = `https://perevod-rus.ru/payment-success?order_id=${orderId}&payment_id=${paymentId}&status=success&paid=true`;
      const failUrl = `https://perevod-rus.ru/payment-failed?order_id=${orderId}&status=failed&paid=false`;

      // 🔥 ГЕНЕРИРУЕМ QR КОД
      const payload = {
        sum: amountForQR,
        qr_size: 400,
        payment_purpose: "Оплата услуг перевода с иностранных языков",
        notification_url: `https://creatium-qr.vercel.app/api/callback?order_id=${orderId}&payment_id=${paymentId}`
      };

      console.log('🚀 Sending to QR service...');
      console.log('📦 QR payload:', JSON.stringify(payload, null, 2));

      const qrResponse = await fetch("https://app.wapiserv.qrm.ooo/operations/qr-code/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": API_KEY
        },
        body: JSON.stringify(payload)
      });

      console.log(`📊 QR API Response: ${qrResponse.status} ${qrResponse.statusText}`);

      if (!qrResponse.ok) {
        const errorText = await qrResponse.text();
        console.error('❌ QR service error:', qrResponse.status, errorText);
        throw new Error(`QR service error: ${qrResponse.status}`);
      }

      const qrResult = await qrResponse.json();
      console.log('✅ QR generated successfully');
      console.log('📋 QR response structure:', JSON.stringify(qrResult, null, 2));

      // 🔥 ПОЛУЧАЕМ OPERATION_ID ИЗ ОТВЕТА
      let operationId = null;
      
      if (qrResult.results && qrResult.results.operation_id) {
        operationId = qrResult.results.operation_id;
        console.log('🔑 Found operation_id in results.operation_id:', operationId);
      } else {
        operationId = paymentId;
        console.log('⚠️ No operation_id found, using paymentId:', operationId);
      }

      console.log('🎯 Final Operation ID for status checking:', operationId);

      // Проверяем что QR-код сгенерирован
      if (!qrResult.results || !qrResult.results.qr_img) {
        console.error('❌ No QR image in response:', qrResult);
        throw new Error('QR code generation failed');
      }

      // 🔥 УЛУЧШЕННЫЙ HTML С ДИАГНОСТИКОЙ
      const htmlForm = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Оплата заказа #${orderId}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 700px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            text-align: center;
        }
        h1 {
            color: #2c3e50;
            margin-bottom: 20px;
        }
        .amount {
            font-size: 32px;
            font-weight: bold;
            color: #27ae60;
            margin: 20px 0;
        }
        .qr-code {
            max-width: 100%;
            border: 2px solid #3498db;
            border-radius: 10px;
            padding: 10px;
            background: white;
        }
        .instructions {
            background: #e3f2fd;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: left;
        }
        .order-info {
            background: #fff3cd;
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
            color: #856404;
        }
        .status-message {
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .status-success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .status-pending {
            background: #fff3cd;
            color: #856404;
            border: 1px solid #ffeaa7;
        }
        .status-error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .checking-status {
            background: #e3f2fd;
            color: #1976d2;
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
        }
        .button {
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
            margin: 10px 5px;
            text-decoration: none;
            display: inline-block;
        }
        .button-success {
            background: #27ae60;
            color: white;
        }
        .button-check {
            background: #3498db;
            color: white;
        }
        .button-cancel {
            background: #e74c3c;
            color: white;
        }
        .debug-info {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            margin: 10px 0;
            font-size: 12px;
            color: #6c757d;
            text-align: left;
            border: 1px dashed #dee2e6;
        }
        .log-container {
            background: #2c3e50;
            color: #ecf0f1;
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            text-align: left;
            max-height: 200px;
            overflow-y: auto;
        }
        .status-codes {
            background: #e8f5e8;
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
            text-align: left;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>💳 Оплата заказа</h1>
        
        <div class="order-info">
            <strong>Заказ #${orderId}</strong><br>
            <small>ID операции: ${operationId}</small><br>
            <small>Payment ID: ${paymentId}</small>
        </div>
        
        <div class="amount">${amountInRub} руб.</div>
        
        <img src="${qrResult.results.qr_img}" alt="QR Code" class="qr-code">
        
        <div class="instructions">
            <strong>Автоматическая проверка статуса оплаты</strong><br>
            • Отсканируйте QR-код и оплатите<br>
            • Система проверит статус автоматически<br>
            • <strong>Авто-возврат ТОЛЬКО при статусе "5" (Оплачено)</strong>
        </div>

        <!-- Информация о статусах -->
        <div class="status-codes">
            <strong>Коды статусов:</strong><br>
            • <strong>3</strong> - Создан (ожидание оплаты)<br>
            • <strong>5</strong> - Оплачено (успех)<br>
            • <strong>Другие</strong> - Ошибка или отмена
        </div>

        <!-- Логи в реальном времени -->
        <div class="debug-info">
            <strong>Логи проверки статуса:</strong>
            <div id="logContainer" class="log-container">
> 🚀 Запуск мониторинга платежа...
> 🎯 Operation ID: ${operationId}
> 💳 Payment ID: ${paymentId}
> 📦 Order ID: ${orderId}
> ⏰ Проверка каждые 10 секунд
            </div>
        </div>

        <!-- Статус проверки -->
        <div id="checkingStatus" class="checking-status">
            🔍 Первая проверка через 5 секунд...
        </div>

        <!-- Сообщения о статусе -->
        <div id="successMessage" class="status-message status-success" style="display: none;">
            ✅ <strong>ОПЛАЧЕНО! Статус: 5</strong><br>
            <div id="countdown" class="checking-status" style="margin: 10px 0;">
                Авто-возврат через: <span id="timer">5</span> сек
            </div>
        </div>

        <div id="pendingMessage" class="status-message status-pending" style="display: none;">
            ⏳ <strong>ОЖИДАНИЕ ОПЛАТЫ</strong><br>
            <small>Текущий статус: <span id="statusInfo">проверяем...</span></small>
        </div>

        <div id="errorMessage" class="status-message status-error" style="display: none;">
            ❌ <strong>ОШИБКА ПРОВЕРКИ</strong><br>
            <small id="errorInfo">Произошла ошибка</small>
        </div>

        <!-- Отладочная информация -->
        <div class="debug-info">
            <strong>Информация для отладки:</strong><br>
            • Operation ID: <code>${operationId}</code><br>
            • Payment ID: ${paymentId}<br>
            • Order ID: ${orderId}<br>
            • Сумма: ${amountInRub} руб.<br>
            • <strong>Требуется статус: 5 (Оплачено)</strong><br>
            • <strong>Проверки: <span id="checkCount">0</span></strong><br>
            • Последний статус: <span id="lastStatus">не проверен</span>
        </div>

        <!-- Кнопки управления -->
        <div style="margin-top: 20px;">
            <button id="checkStatusBtn" class="button button-check">🔄 Проверить статус сейчас</button>
            <button id="forceSuccessBtn" class="button button-success">✅ Тест успешной оплаты</button>
            <a href="${successUrl}" id="manualSuccessBtn" class="button button-success">📱 Я оплатил (вручную)</a>
            <a href="${failUrl}" class="button button-cancel">❌ Отмена</a>
        </div>
    </div>

    <script>
        const operationId = '${operationId}';
        const paymentId = '${paymentId}';
        const orderId = '${orderId}';
        const successUrl = '${successUrl}';
        
        let checkInterval;
        let paidStatus = false;
        let checkCount = 0;
        let lastStatus = 'не проверен';

        // Элементы DOM
        const checkingStatus = document.getElementById('checkingStatus');
        const successMessage = document.getElementById('successMessage');
        const pendingMessage = document.getElementById('pendingMessage');
        const errorMessage = document.getElementById('errorMessage');
        const countdown = document.getElementById('countdown');
        const timer = document.getElementById('timer');
        const statusInfo = document.getElementById('statusInfo');
        const errorInfo = document.getElementById('errorInfo');
        const checkStatusBtn = document.getElementById('checkStatusBtn');
        const forceSuccessBtn = document.getElementById('forceSuccessBtn');
        const manualSuccessBtn = document.getElementById('manualSuccessBtn');
        const logContainer = document.getElementById('logContainer');
        const checkCountElement = document.getElementById('checkCount');
        const lastStatusElement = document.getElementById('lastStatus');

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
                checkingStatus.textContent = '🔍 Проверяем статус платежа...';
                addLog('Проверка #' + checkCount + '...');
                
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
                
                // Обновляем последний статус
                lastStatus = result.statusCode || result.status || 'unknown';
                lastStatusElement.textContent = lastStatus + (result.message ? ' - ' + result.message : '');
                
                addLog('📊 Ответ API: статус ' + result.status + ', код: ' + lastStatus);
                console.log('Status check result:', result);
                
                checkingStatus.style.display = 'none';
                
                if (result.success && result.status === 'paid') {
                    // 🔥 ПЛАТЕЖ УСПЕШЕН
                    paidStatus = true;
                    addLog('🎉 ОПЛАЧЕНО! Статус 5 обнаружен!');
                    showSuccess(result.message, result.data);
                } else if (result.status === 'pending') {
                    // 🔥 ОЖИДАНИЕ ОПЛАТЫ
                    addLog('⏳ Ожидание оплаты. Код: ' + lastStatus);
                    showPending(lastStatus, result.message);
                } else {
                    // 🔥 НЕ ОПЛАЧЕНО ИЛИ ОШИБКА
                    addLog('❌ Не оплачено. Код: ' + lastStatus + ', Сообщение: "' + (result.message || 'не оплачено') + '"');
                    showPending(lastStatus, result.message);
                }
                
            } catch (error) {
                console.error('Status check failed:', error);
                addLog('💥 Ошибка проверки: ' + error.message);
                checkingStatus.style.display = 'none';
                showError('Ошибка проверки: ' + error.message);
            }
        }

        // Показать успешный статус
        function showSuccess(message, data) {
            successMessage.style.display = 'block';
            pendingMessage.style.display = 'none';
            errorMessage.style.display = 'none';
            checkStatusBtn.style.display = 'none';
            forceSuccessBtn.style.display = 'none';
            manualSuccessBtn.style.display = 'none';
            
            const statusCode = data?.results?.operation_status_code;
            const statusMsg = data?.results?.operation_status_msg;
            
            statusInfo.textContent = statusMsg || message || 'Оплачено';
            
            // Остановить проверку
            if (checkInterval) {
                clearInterval(checkInterval);
                addLog('✅ Останавливаем проверку - оплата подтверждена');
            }
            
            // Запустить авто-редирект
            startAutoRedirect();
        }

        // Показать ожидание
        function showPending(statusCode, statusMsg) {
            successMessage.style.display = 'none';
            pendingMessage.style.display = 'block';
            errorMessage.style.display = 'none';
            statusInfo.textContent = 'код ' + statusCode + ' - ' + (statusMsg || 'не оплачено');
        }

        // Показать ошибку
        function showError(errorMsg) {
            successMessage.style.display = 'none';
            pendingMessage.style.display = 'none';
            errorMessage.style.display = 'block';
            errorInfo.textContent = errorMsg;
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
                    addLog('🔄 Выполняем авто-редирект на сайт...');
                    window.location.href = successUrl;
                }
            }, 1000);
        }

        // Начать автоматическую проверку
        function startAutoCheck() {
            // Первая проверка через 5 секунд
            setTimeout(() => {
                checkPaymentStatus();
                // Дальнейшие проверки каждые 10 секунд
                checkInterval = setInterval(checkPaymentStatus, 10000);
            }, 5000);
        }

        // Ручная проверка по кнопке
        checkStatusBtn.addEventListener('click', checkPaymentStatus);

        // Тест успешной оплаты
        forceSuccessBtn.addEventListener('click', function() {
            addLog('🧪 ТЕСТ: Имитация успешной оплаты');
            showSuccess('Тестовый успех', { results: { operation_status_code: 5, operation_status_msg: 'Тест оплаты' } });
        });

        // Запуск при загрузке
        addLog('🚀 Запуск мониторинга платежа...');
        addLog('🎯 Operation ID: ' + operationId);
        addLog('💳 Payment ID: ' + paymentId);
        addLog('⏰ Проверка каждые 10 секунд');
        startAutoCheck();

    </script>
</body>
</html>
      `;

      const response = {
        success: true,
        form: htmlForm,
        url: `https://creatium-qr.vercel.app/?sum=${amountInRub}&order_id=${orderId}&operation_id=${operationId}`,
        amount: amountInRub,
        order_id: orderId,
        payment_id: paymentId,
        operation_id: operationId
      };

      console.log('✅ Returning successful response to Creatium');
      
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json(response);

    } catch (error) {
      console.error('❌ Error processing payment:', error);
      
      const errorHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Ошибка</title></head>
<body style="font-family: Arial; text-align: center; padding: 50px;">
  <h2 style="color: #e74c3c;">❌ Ошибка оплаты</h2>
  <p>${error.message}</p>
  <a href="https://perevod-rus.ru" style="background: #3498db; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px;">
    Вернуться на сайт
  </a>
</body>
</html>
      `;
      
      console.log('📤 Returning error response to Creatium');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json({
        success: false,
        error: error.message,
        form: errorHtml
      });
    }
  }

  // Остальной код GET обработчика остается таким же...
  // [Здесь должен быть тот же GET обработчик что и в предыдущем коде]
  
  // Если метод не поддерживается или путь не найден
  return res.status(404).json({
    error: 'Not found',
    message: 'Endpoint not found'
  });
};
