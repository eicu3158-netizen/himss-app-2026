import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Calendar, User, MapPin, Clock, ExternalLink, Users, ChevronRight, Search, Plane, Hotel, Loader2, AlertCircle, MessageSquare, Send, Bot, X } from 'lucide-react';

// --- 配置區 ---
// 您的 Google Sheet 發佈後的 CSV 網址
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSqdYNm6Jily3xky0ZfZ2sbHIPfRytu-U4UMAlSDN-19y8rVYUj94cMGioxs0e5bYOmC5GZUG-Nanwj/pub?output=csv"; 

// Gemini API 設定
const apiKey = ""; // 系統自動提供
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";

const CATEGORY_COLORS = {
  "行程": "bg-blue-100 text-blue-700 border-blue-200",
  "住宿": "bg-green-100 text-green-700 border-green-200",
  "會議相關": "bg-purple-100 text-purple-700 border-purple-200",
  "餐會外部": "bg-orange-100 text-orange-700 border-orange-200",
  "參訪外部": "bg-indigo-100 text-indigo-700 border-indigo-200",
  "其他": "bg-slate-100 text-slate-700 border-slate-200"
};

const App = () => {
  const [activeTab, setActiveTab] = useState('schedule'); // 'schedule' or 'qa'
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedUser, setSelectedUser] = useState("全體");
  const [selectedDate, setSelectedDate] = useState("");
  
  // AI 聊天相關狀態
  const [messages, setMessages] = useState([
    { role: 'assistant', text: '您好！我是您的 2026 HIMSS+GTC 參訪助手。我已準備好回答關於行程、班機或飯店的任何問題。' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  // 初始化讀取資料
  useEffect(() => {
    fetchData();
  }, []);

  // 自動捲動聊天室到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch(GOOGLE_SHEET_CSV_URL);
      if (!response.ok) throw new Error("無法取得試算表資料");
      
      const csv = await response.text();
      const lines = csv.split('\n').filter(line => line.trim() !== '');
      if (lines.length < 2) throw new Error("試算表內無有效資料");

      const headers = lines[0].split(',').map(h => h.trim());
      const parsedData = lines.slice(1).map(line => {
        // 使用 Regex 處理 CSV 欄位，避免逗號衝突
        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        const obj = {};
        headers.forEach((header, i) => {
          const val = values[i]?.replace(/^"|"$/g, '').trim();
          if (header === 'members') {
            obj[header] = val ? val.split(/[、,]/).map(name => name.trim()) : [];
          } else {
            obj[header] = val;
          }
        });
        return obj;
      });

      setData(parsedData);
      // 預設選擇第一個日期
      if (parsedData.length > 0) {
        const sortedDates = [...new Set(parsedData.map(item => item.date))].sort();
        setSelectedDate(sortedDates[0]);
      }
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError("雲端同步失敗，請檢查 Google Sheet 發佈設定。");
      setLoading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMessage = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setInput('');
    setIsTyping(true);

    try {
      // 構建 AI 的上下文知識庫
      const context = data.slice(0, 50).map(item => 
        `日期:${item.date}, 時間:${item.time}, 活動:${item.activity}, 地點:${item.location}, 成員:${item.members?.join('、')}, 備註:${item.note}`
      ).join('\n');

      const systemPrompt = `你是一位專業的行程助手。以下是 2026 HIMSS+GTC 參訪團的詳細行程資料：\n${context}\n
      請根據上述資料回答使用者的問題。
      規範：
      1. 使用繁體中文，語氣親切。
      2. 查詢特定成員行程時，若成員欄包含該姓名或為「全體」，即視為其行程。
      3. 若資料庫無相關答案，請建議聯繫副院長吳星賢。`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userMessage }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] }
        })
      });

      const result = await response.json();
      const aiResponse = result.candidates?.[0]?.content?.parts?.[0]?.text || "抱歉，目前 AI 忙碌中，請稍後再試。";
      
      setMessages(prev => [...prev, { role: 'assistant', text: aiResponse }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: "連線錯誤，請確認網路連線。" }]);
    } finally {
      setIsTyping(false);
    }
  };

  // 提取成員清單（不重複）
  const memberList = useMemo(() => {
    const members = new Set();
    data.forEach(item => item.members?.forEach(m => {
      if (m && m !== "全體") members.add(m);
    }));
    return Array.from(members).sort();
  }, [data]);

  // 提取日期清單
  const dates = useMemo(() => [...new Set(data.map(item => item.date))].sort(), [data]);

  // 篩選後顯示的行程
  const filteredSchedule = useMemo(() => {
    return data.filter(item => {
      const isDateMatch = item.date === selectedDate;
      const isUserMatch = selectedUser === "全體" || 
                          item.members?.some(m => m.includes(selectedUser)) || 
                          item.members?.includes("全體");
      return isDateMatch && isUserMatch;
    });
  }, [selectedDate, selectedUser, data]);

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
      <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
      <p className="text-slate-500 font-medium animate-pulse">正在同步雲端行程...</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
      <p className="text-slate-800 font-bold mb-2">{error}</p>
      <button onClick={fetchData} className="px-6 py-2 bg-indigo-600 text-white rounded-xl shadow-lg">重新載入</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      {/* 導覽列 */}
      <header className="bg-indigo-700 text-white p-5 shadow-lg sticky top-0 z-50">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Plane className="w-6 h-6" /> HIMSS+GTC 2026
          </h1>
          <div className="flex bg-indigo-800/50 p-1 rounded-lg">
            <button 
              onClick={() => setActiveTab('schedule')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'schedule' ? 'bg-white text-indigo-700 shadow' : 'text-indigo-100'}`}
            >
              行程表
            </button>
            <button 
              onClick={() => setActiveTab('qa')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'qa' ? 'bg-white text-indigo-700 shadow' : 'text-indigo-100'}`}
            >
              智慧助手
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        {activeTab === 'schedule' ? (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* 控制面板 */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">查看對象</label>
                  <select 
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500"
                    value={selectedUser}
                    onChange={(e) => setSelectedUser(e.target.value)}
                  >
                    <option value="全體">全體團體行程</option>
                    {memberList.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">日期導覽</label>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    {dates.map(date => {
                      const day = date.split('/')[2];
                      const isSelected = selectedDate === date;
                      return (
                        <button
                          key={date}
                          onClick={() => setSelectedDate(date)}
                          className={`flex-shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center transition-all ${isSelected ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                          <span className="text-[10px] font-bold">3/{day}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>

            {/* 行程列表 */}
            <div className="space-y-4">
              {filteredSchedule.length > 0 ? (
                filteredSchedule.map((item, idx) => (
                  <div key={idx} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow">
                    <div className="p-5">
                      <div className="flex justify-between items-start mb-3">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold border ${CATEGORY_COLORS[item.category] || CATEGORY_COLORS["其他"]}`}>
                          {item.category}
                        </span>
                        <span className="text-slate-400 text-xs flex items-center gap-1">
                          <Clock size={12} /> {item.time}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-slate-800 mb-2">{item.activity}</h3>
                      <div className="space-y-1.5 text-sm text-slate-500">
                        <div className="flex items-center gap-2"><MapPin size={14} className="text-indigo-400" /> {item.location}</div>
                        <div className="flex items-start gap-2">
                          <Users size={14} className="mt-0.5 text-indigo-400" /> 
                          <span className="flex-1 leading-tight">{item.members?.join('、')}</span>
                        </div>
                      </div>
                      {item.note && (
                        <div className="mt-4 p-3 bg-slate-50 rounded-xl text-xs text-slate-500 border border-slate-100">
                          {item.note}
                          {item.note.includes('http') && (
                            <a 
                              href={item.note.match(/https?:\/\/[^\s]+/)?.[0]} 
                              target="_blank" 
                              rel="noreferrer"
                              className="mt-3 flex items-center justify-center gap-2 bg-white border border-indigo-200 py-2.5 rounded-xl text-indigo-600 font-bold hover:bg-indigo-50 transition-colors"
                            >
                              <ExternalLink size={14} /> 開啟雲端連結
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-slate-400 bg-white rounded-2xl border border-dashed">
                  今日無排定行程
                </div>
              )}
            </div>
          </div>
        ) : (
          /* AI 智慧助手界面 */
          <div className="flex flex-col h-[70vh] bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-4">
            <div className="bg-indigo-600 p-4 flex items-center gap-3 text-white">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <Bot size={24} />
              </div>
              <div>
                <h2 className="font-bold text-sm">參訪團智慧助手</h2>
                <p className="text-[10px] opacity-80">基於即時行程與試算表資料回答</p>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-3.5 rounded-2xl text-sm ${
                    msg.role === 'user' 
                      ? 'bg-indigo-600 text-white rounded-tr-none shadow-md' 
                      : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none shadow-sm'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-200 p-3 rounded-2xl rounded-tl-none shadow-sm">
                    <Loader2 size={16} className="animate-spin text-indigo-500" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-slate-100 flex gap-2">
              <input 
                type="text" 
                placeholder="詢問行程、人名或飯店..."
                className="flex-1 bg-slate-100 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500"
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <button 
                type="submit" 
                disabled={isTyping}
                className="bg-indigo-600 text-white p-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                <Send size={20} />
              </button>
            </form>
          </div>
        )}
      </main>

      {/* 手機底部快速導覽 */}
      <footer className="fixed bottom-0 w-full bg-white border-t border-slate-200 px-8 py-3 flex justify-around items-center md:hidden z-50">
        <button onClick={() => setActiveTab('schedule')} className={`flex flex-col items-center gap-1 ${activeTab === 'schedule' ? 'text-indigo-600' : 'text-slate-400'}`}>
          <Calendar size={22} />
          <span className="text-[10px] font-bold">行程表</span>
        </button>
        <button onClick={() => setActiveTab('qa')} className={`flex flex-col items-center gap-1 ${activeTab === 'qa' ? 'text-indigo-600' : 'text-slate-400'}`}>
          <MessageSquare size={22} />
          <span className="text-[10px] font-bold">智慧助手</span>
        </button>
      </footer>
    </div>
  );
};

export default App;
