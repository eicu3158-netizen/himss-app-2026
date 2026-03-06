import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Calendar, MapPin, Clock, ExternalLink, Users, Plane, Loader2, Send, Bot, MessageSquare, AlertCircle } from 'lucide-react';

// --- 配置區 ---
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSqdYNm6Jily3xky0ZfZ2sbHIPfRytu-U4UMAlSDN-19y8rVYUj94cMGioxs0e5bYOmC5GZUG-Nanwj/pub?output=csv"; 
const apiKey = ""; 
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
  const [activeTab, setActiveTab] = useState('schedule');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedUser, setSelectedUser] = useState("全體");
  const [selectedDate, setSelectedDate] = useState("");
  
  const [messages, setMessages] = useState([{ role: 'assistant', text: '您好！我是您的 2026 HIMSS+GTC 參訪助手。我已準備好回答關於行程的任何問題。' }]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch(GOOGLE_SHEET_CSV_URL);
      if (!response.ok) throw new Error("無法讀取試算表資料");
      const csv = await response.text();
      const lines = csv.split('\n').filter(line => line.trim() !== '');
      const headers = lines[0].split(',').map(h => h.trim());
      
      const parsedData = lines.slice(1).map(line => {
        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        const obj = {};
        headers.forEach((header, i) => {
          const val = values[i]?.replace(/^"|"$/g, '').trim();
          if (header === 'members') {
            obj[header] = val ? val.split(/[、,]/).map(n => n.trim()) : [];
          } else {
            obj[header] = val;
          }
        });
        return obj;
      });

      setData(parsedData);
      if (parsedData.length > 0) {
        const sortedDates = [...new Set(parsedData.map(item => item.date))].sort();
        setSelectedDate(sortedDates[0]);
      }
      setLoading(false);
    } catch (err) {
      setError("資料載入失敗，請確認試算表已發佈為 CSV。");
      setLoading(false);
    }
  };

  // 實作帶有指數退避 (Exponential Backoff) 的 API 調用
  const fetchGeminiResponse = async (userMsg, context, retries = 5, delay = 1000) => {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userMsg }] }],
          systemInstruction: { parts: [{ text: `你是一位專業的行程助手。以下是行程資料：\n${context}\n請用親切的繁體中文回答。` }] }
        })
      });

      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      const result = await response.json();
      return result.candidates?.[0]?.content?.parts?.[0]?.text;
    } catch (err) {
      if (retries > 0) {
        await new Promise(res => setTimeout(res, delay));
        return fetchGeminiResponse(userMsg, context, retries - 1, delay * 2);
      }
      throw err;
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setIsTyping(true);

    try {
      const context = data.map(i => `日期:${i.date}, 時間:${i.time}, 活動:${i.activity}, 地點:${i.location}`).join('\n');
      const aiText = await fetchGeminiResponse(userMsg, context);
      setMessages(prev => [...prev, { role: 'assistant', text: aiText || "抱歉，我暫時無法回答這個問題。" }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: "系統連線逾時，請稍後再試。" }]);
    } finally {
      setIsTyping(false);
    }
  };

  const memberList = useMemo(() => {
    const members = new Set();
    data.forEach(item => item.members?.forEach(m => { if (m && m !== "全體") members.add(m); }));
    return Array.from(members).sort();
  }, [data]);

  const dates = useMemo(() => [...new Set(data.map(item => item.date))].sort(), [data]);

  const filteredSchedule = useMemo(() => {
    return data.filter(i => 
      i.date === selectedDate && 
      (selectedUser === "全體" || i.members?.some(m => m.includes(selectedUser)) || i.members?.includes("全體"))
    );
  }, [selectedDate, selectedUser, data]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600 w-10 h-10" /></div>;

  if (error) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <AlertCircle className="text-red-500 w-12 h-12 mb-4" />
      <p className="font-bold text-slate-800">{error}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-20 text-slate-900">
      <header className="bg-indigo-700 text-white p-5 sticky top-0 z-50 flex justify-between items-center shadow-lg">
        <h1 className="text-xl font-bold flex items-center gap-2"><Plane /> HIMSS+GTC 2026</h1>
        <div className="flex bg-indigo-800/50 p-1 rounded-lg">
          <button onClick={() => setActiveTab('schedule')} className={`px-4 py-1.5 rounded-md text-sm transition-all ${activeTab === 'schedule' ? 'bg-white text-indigo-700 shadow' : 'text-indigo-100'}`}>行程表</button>
          <button onClick={() => setActiveTab('qa')} className={`px-4 py-1.5 rounded-md text-sm transition-all ${activeTab === 'qa' ? 'bg-white text-indigo-700 shadow' : 'text-indigo-100'}`}>AI 助手</button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        {activeTab === 'schedule' ? (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <select className="w-full bg-slate-50 border-none rounded-xl mb-4 p-3 focus:ring-2 focus:ring-indigo-500" value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}>
                <option value="全體">全體團體行程</option>
                {memberList.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {dates.map(d => (
                  <button key={d} onClick={() => setSelectedDate(d)} className={`flex-shrink-0 w-12 h-12 rounded-xl text-xs font-bold transition-all ${selectedDate === d ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-500'}`}>
                    3/{d.split('/')[2]}
                  </button>
                ))}
              </div>
            </div>

            {filteredSchedule.map((item, i) => (
              <div key={i} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                <div className="flex justify-between mb-2">
                  <span className={`px-2 py-1 rounded text-[10px] font-bold border ${CATEGORY_COLORS[item.category] || CATEGORY_COLORS["其他"]}`}>{item.category}</span>
                  <span className="text-xs text-slate-400 flex items-center gap-1"><Clock size={12}/> {item.time}</span>
                </div>
                <h3 className="font-bold text-slate-800 text-lg">{item.activity}</h3>
                <p className="text-sm text-slate-500 mt-2 flex items-center gap-1"><MapPin size={14} className="text-indigo-400"/> {item.location}</p>
                {item.note && <div className="mt-3 p-3 bg-slate-50 rounded-xl text-xs border border-slate-100 whitespace-pre-wrap">{item.note}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col h-[70vh] bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`p-3 rounded-2xl text-sm max-w-[85%] shadow-sm ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border text-slate-700 rounded-tl-none'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {isTyping && <div className="flex justify-start"><div className="bg-white border p-3 rounded-xl animate-pulse text-indigo-500"><Loader2 className="animate-spin" size={16}/></div></div>}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleSendMessage} className="p-4 border-t flex gap-2 bg-white">
              <input className="flex-1 bg-slate-100 border-none rounded-xl px-4 text-sm focus:ring-2 focus:ring-indigo-500" value={input} onChange={(e) => setInput(e.target.value)} placeholder="詢問行程細節..." />
              <button disabled={isTyping} className="bg-indigo-600 text-white p-2.5 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"><Send size={20}/></button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
