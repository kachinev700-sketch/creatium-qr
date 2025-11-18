// 🔐 БЕЗОПАСНОЕ ИСПОЛЬЗОВАНИЕ ПЕРЕМЕННЫХ ОКРУЖЕНИЯ
const API_KEY = process.env.QR_API_KEY;

// 🔥 ХРАНИЛИЩЕ ДЛЯ СООТВЕТСТВИЯ OPERATION_ID -> CALLBACK_ID
const paymentMappings = new Map();

// 🔥 ФУНКЦИЯ ДЛЯ ПРОВЕРКИ СТАТУСА ПЛАТЕЖА
async function checkPaymentStatus(operationId) {
  try {
    console.log(`🔍 Checking payment status for: ${operationId}`);
    
    // 🔥 ПРОВЕРЯЕМ, ЕСТЬ ЛИ СООТВЕТСТВИЕ С CALLBACK ID
    const callbackId = paymentMappings.get(operationId);
    if (callbackId) {
      console.log(`🎯 Found callback mapping: ${operationId} -> ${callbackId}`);
      
      const callbackStatus = await checkStatusById(callbackId);
      if (callbackStatus) {
        return callbackStatus;
      }
    }
    
    // 🔥 ПРОВЕРЯЕМ ЧЕРЕЗ ОСНОВНОЙ ENDPOINT
    const response = await fetch(`https://app.wapiserv.qrm.ooo/operations/${operationId}/qr-status/`, {
      method: "GET",
      headers: {
        "accept": "application/json",
        "X-Api-Key": API_KEY
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      const statusCode = data.results?.operation_status_code;
      
      if (statusCode === 5) {
        console.log('🎉 PAYMENT SUCCESSFUL!');
        return { 
          success: true, 
          status: 'paid'
        };
      }
    }
    
    return { 
      success: false, 
      status: 'pending'
    };
    
  } catch (error) {
    console.error('Error checking payment status:', error);
    return { 
      success: false, 
      status: 'error'
    };
  }
}

// 🔥 ФУНКЦИЯ ДЛЯ ПРОВЕРКИ ПО CALLBACK ID
async function checkStatusById(callbackId) {
  try {
    const response = await fetch(`https://app.wapiserv.qrm.ooo/operations/${callbackId}/qr-status/`, {
      method: "GET",
      headers: {
        "accept": "application/json",
        "X-Api-Key": API_KEY
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      const statusCode = data.results?.operation_status_code;
      
      if (statusCode === 5) {
        console.log('🎉 PAYMENT SUCCESSFUL via callback ID!');
        return { 
          success: true, 
          status: 'paid',
          fromCallback: true
        };
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
      
      let callbackData = {};
      if (body && body.trim() !== '') {
        try {
          callbackData = JSON.parse(body);
          console.log('✅ Callback data received');
          
          // 🔥 СОХРАНЯЕМ СООТВЕТСТВИЕ ID
          const callbackId = callbackData.id;
          const urlParams = new URLSearchParams(req.url.split('?')[1]);
          const operationId = urlParams.get('operation_id');
          
          if (callbackId && operationId) {
            console.log(`💾 Saving payment mapping: ${operationId} -> ${callbackId}`);
            paymentMappings.set(operationId, callbackId);
          }
          
        } catch (parseError) {
          console.error('Callback JSON parse error:', parseError);
        }
      }
      
      return res.status(200).json({ success: true, message: 'Callback received' });
      
    } catch (error) {
      console.error('Callback error:', error);
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
      console.log(`🔍 Status check for operation: ${operationId}`);
      
      if (!operationId) {
        return res.status(400).json({ success: false, error: 'Operation ID required' });
      }
      
      const statusResult = await checkPaymentStatus(operationId);
      return res.status(200).json(statusResult);
      
    } catch (error) {
      console.error('Status check error:', error);
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
      
      let data = {};
      if (body && body.trim() !== '') {
        try {
          data = JSON.parse(body);
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
      const operationId = qrResult.results?.operation_id || paymentId;

      // 🔥 СОЗДАЕМ ЧИСТУЮ СТРАНИЦУ ДЛЯ ПОКУПАТЕЛЯ
      const htmlForm = createCleanPaymentPage(orderId, operationId, amountInRub, qrResult.results.qr_img, successUrl, failUrl);
      
      const response = {
        success: true,
        form: htmlForm,
        url: `https://creatium-qr.vercel.app/?sum=${amountInRub}&order_id=${orderId}&operation_id=${operationId}`,
        amount: amountInRub,
        order_id: orderId,
        payment_id: paymentId,
        operation_id: operationId
      };

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json(response);

    } catch (error) {
      console.error('Payment processing error:', error);
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

      if (sum && order_id && operation_id) {
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
        const html = createCleanPaymentPage(order_id, operation_id, amountInRub, qrResult.results.qr_img, successUrl, failUrl);
        
        res.setHeader('Content-Type', 'text/html');
        return res.status(200).send(html);
      }

      // Простой тест для GET без параметров
      const amountInRub = 100;
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
      const successUrl = `https://perevod-rus.ru/payment-success?order_id=test&operation_id=${operationId}&status=success&paid=true`;
      const failUrl = `https://perevod-rus.ru/payment-failed?order_id=test&status=failed&paid=false`;

      const html = createCleanPaymentPage('test', operationId, amountInRub, qrResult.results.qr_img, successUrl, failUrl);

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

// 🔥 ЧИСТАЯ СТРАНИЦА ДЛЯ ПОКУПАТЕЛЯ
function createCleanPaymentPage(orderId, operationId, amountInRub, qrImage, successUrl, failUrl) {
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Оплата заказа #${orderId}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Arial', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            padding: 40px;
            max-width: 500px;
            width: 100%;
            text-align: center;
        }
        
        .header {
            margin-bottom: 30px;
        }
        
        .header h1 {
            color: #2c3e50;
            font-size: 28px;
            margin-bottom: 10px;
            font-weight: 600;
        }
        
        .order-info {
            color: #7f8c8d;
            font-size: 16px;
            margin-bottom: 5px;
        }
        
        .amount {
            font-size: 42px;
            font-weight: bold;
            color: #27ae60;
            margin: 25px 0;
            text-shadow: 0 2px 4px rgba(39, 174, 96, 0.2);
        }
        
        .qr-container {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 15px;
            margin: 25px 0;
            border: 2px solid #e9ecef;
        }
        
        .qr-code {
            max-width: 100%;
            border-radius: 10px;
        }
        
        .instructions {
            background: #e3f2fd;
            padding: 20px;
            border-radius: 12px;
            margin: 25px 0;
            text-align: left;
        }
        
        .instructions h3 {
            color: #1976d2;
            margin-bottom: 10px;
            font-size: 18px;
        }
        
        .instructions ul {
            list-style: none;
            padding-left: 0;
        }
        
        .instructions li {
            padding: 8px 0;
            color: #455a64;
            border-bottom: 1px solid #bbdefb;
        }
        
        .instructions li:last-child {
            border-bottom: none;
        }
        
        .instructions li:before {
            content: "•";
            color: #1976d2;
            font-weight: bold;
            display: inline-block;
            width: 1em;
            margin-left: -1em;
        }
        
        .status-area {
            margin: 25px 0;
        }
        
        .status-message {
            background: #fff3cd;
            color: #856404;
            padding: 15px;
            border-radius: 10px;
            border: 1px solid #ffeaa7;
            font-size: 16px;
            margin-bottom: 15px;
        }
        
        .status-success {
            background: #d4edda;
            color: #155724;
            border-color: #c3e6cb;
        }
        
        .countdown {
            background: #e3f2fd;
            color: #1976d2;
            padding: 12px;
            border-radius: 8px;
            font-size: 14px;
            margin: 15px 0;
        }
        
        .timer {
            font-weight: bold;
            font-size: 18px;
        }
        
        .cancel-btn {
            background: #e74c3c;
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 10px;
            font-size: 16px;
            cursor: pointer;
            width: 100%;
            transition: all 0.3s ease;
            font-weight: 600;
        }
        
        .cancel-btn:hover {
            background: #c0392b;
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(231, 76, 60, 0.3);
        }
        
        .hidden {
            display: none;
        }
        
        @media (max-width: 480px) {
            .container {
                padding: 25px;
                margin: 10px;
            }
            
            .header h1 {
                font-size: 24px;
            }
            
            .amount {
                font-size: 36px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>💳 Оплата заказа</h1>
            <div class="order-info">Заказ #${orderId}</div>
        </div>
        
        <div class="amount">${amountInRub} ₽</div>
        
        <div class="qr-container">
            <img src="${qrImage}" alt="QR Code" class="qr-code">
        </div>
        
        <div class="instructions">
            <h3>Инструкция по оплате:</h3>
            <ul>
                <li>Откройте приложение вашего банка</li>
                <li>Наведите камеру на QR-код</li>
                <li>Подтвердите платеж в приложении</li>
                <li>Ожидайте автоматического подтверждения</li>
            </ul>
        </div>
        
        <div class="status-area">
            <div id="pendingMessage" class="status-message">
                ⏳ Ожидание платежа...
            </div>
            
            <div id="successMessage" class="status-message status-success hidden">
                ✅ Платеж успешно завершен!
                <div id="countdown" class="countdown">
                    Автоматическое перенаправление через: <span class="timer" id="timer">5</span> сек
                </div>
            </div>
        </div>
        
        <button id="cancelBtn" class="cancel-btn">
            ❌ Отменить оплату
        </button>
    </div>

    <script>
        const operationId = '${operationId}';
        const successUrl = '${successUrl}';
        const failUrl = '${failUrl}';
        
        let checkInterval;
        let timeoutInterval;
        let minutesLeft = 5;
        let secondsLeft = 0;
        
        // Элементы DOM
        const pendingMessage = document.getElementById('pendingMessage');
        const successMessage = document.getElementById('successMessage');
        const countdown = document.getElementById('countdown');
        const timer = document.getElementById('timer');
        const cancelBtn = document.getElementById('cancelBtn');
        
        // Функция проверки статуса платежа
        async function checkPaymentStatus() {
            try {
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
                
                if (result.success && result.status === 'paid') {
                    // 🔥 ПЛАТЕЖ УСПЕШЕН
                    showSuccess();
                }
                
            } catch (error) {
                console.error('Status check failed:', error);
            }
        }
        
        // Показать успешный статус
        function showSuccess() {
            pendingMessage.classList.add('hidden');
            successMessage.classList.remove('hidden');
            cancelBtn.classList.add('hidden');
            
            // Остановить проверку
            if (checkInterval) {
                clearInterval(checkInterval);
            }
            if (timeoutInterval) {
                clearInterval(timeoutInterval);
            }
            
            // Запустить авто-редирект
            startAutoRedirect();
        }
        
        // Автоматическое перенаправление при успехе
        function startAutoRedirect() {
            let seconds = 5;
            const countdownInterval = setInterval(() => {
                seconds--;
                timer.textContent = seconds;
                
                if (seconds <= 0) {
                    clearInterval(countdownInterval);
                    window.location.href = successUrl;
                }
            }, 1000);
        }
        
        // Таймер 5 минут
        function startTimeoutTimer() {
            updateTimeoutDisplay();
            
            timeoutInterval = setInterval(() => {
                if (secondsLeft === 0) {
                    if (minutesLeft === 0) {
                        // Время вышло - редирект на страницу неудачи
                        clearInterval(timeoutInterval);
                        window.location.href = failUrl;
                        return;
                    }
                    minutesLeft--;
                    secondsLeft = 59;
                } else {
                    secondsLeft--;
                }
                updateTimeoutDisplay();
            }, 1000);
        }
        
        function updateTimeoutDisplay() {
            const timeString = `${minutesLeft}:${secondsLeft < 10 ? '0' : ''}${secondsLeft}`;
            pendingMessage.innerHTML = `⏳ Ожидание платежа...<br><small>Автоматическая отмена через: ${timeString}</small>`;
        }
        
        // Обработчик кнопки отмены
        cancelBtn.addEventListener('click', function() {
            if (confirm('Вы уверены, что хотите отменить оплату?')) {
                window.location.href = failUrl;
            }
        });
        
        // Запуск при загрузке
        startTimeoutTimer();
        
        // Первая проверка через 1 секунду, затем каждые 3 секунды
        setTimeout(() => {
            checkPaymentStatus();
            checkInterval = setInterval(checkPaymentStatus, 3000);
        }, 1000);
        
    </script>
</body>
</html>
  `;
}
