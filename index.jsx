import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Calendar, MapPin, Clock, ExternalLink, Users, Plane, Loader2, Send, Bot, MessageSquare } from 'lucide-react';

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
  const [selectedUser, setSelectedUser] = useState("全體");
  const [selectedDate, setSelectedDate] = useState("");
  const [messages, setMessages] = useState([{ role: 'assistant', text: '您好！我是您的 2026 HIMSS+GTC 參訪助手。' }]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const fetchData = async () => {
    try {
      const response = await fetch(GOOGLE_SHEET_CSV_URL);
      const csv = await response.text();
      const lines = csv.split('\n').filter(line => line.trim() !== '');
      const headers = lines[0].split(',');
      const parsedData = lines.slice(1).map(line => {
        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        const obj = {};
        headers.forEach((header, i) => {
          const val = values[i]?.replace(/^"|"$/g, '').trim();
          const key = header.trim();
          if (key === 'members') obj[key] = val ? val.split(/[、,]/).map(n => n.trim()) : [];
          else obj[key] = val;
        });
        return obj;
      });
      setData(parsedData);
      if (parsedData.length > 0) setSelectedDate(parsedData[0].date);
      setLoading(false);
    } catch (err) { setLoading(false); }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;
    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setIsTyping(true);
    try {
      const context = data.map(i => `${i.date} ${i.time}: ${i.activity}`).join('\n');
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userMsg }] }],
          systemInstruction: { parts: [{ text: `你是行程助手。行程：\n${context}` }] }
        })
      });
      const result = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', text: result.candidates?.[0]?.content?.parts?.[0]?.text || "抱歉..." }]);
    } catch { setMessages(prev => [...prev, { role: 'assistant', text: "錯誤。" }]); }
    finally { setIsTyping(false); }
  };

  const memberList = useMemo(() => {
    const members = new Set();
    data.forEach(item => item.members?.forEach(m => { if (m && m !== "全體") members.add(m); }));
    return Array.from(members).sort();
  }, [data]);

  const dates = useMemo(() => [...new Set(data.map(item => item.date))].sort(), [data]);
  const filteredSchedule = useMemo(() => data.filter(i => i.date === selectedDate && (selectedUser === "全體" || i.members?.includes(selectedUser) || i.members?.includes("全體"))), [selectedDate, selectedUser, data]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-indigo-700 text-white p-5 sticky top-0 z-50 flex justify-between items-center shadow-lg">
        <h1 className="text-xl font-bold flex items-center gap-2"><Plane /> HIMSS+GTC 2026</h1>
        <div className="flex bg-indigo-800/50 p-1 rounded-lg">
          <button onClick={() => setActiveTab('schedule')} className={`px-4 py-1.5 rounded-md text-sm ${activeTab === 'schedule' ? 'bg-white text-indigo-700' : 'text-indigo-100'}`}>行程表</button>
          <button onClick={() => setActiveTab('qa')} className={`px-4 py-1.5 rounded-md text-sm ${activeTab === 'qa' ? 'bg-white text-indigo-700' : 'text-indigo-100'}`}>AI 助手</button>
        </div>
      </header>
      <main className="max-w-4xl mx-auto p-4">
        {activeTab === 'schedule' ? (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border">
              <select className="w-full bg-slate-50 border-none rounded-xl mb-4" value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}>
                <option value="全體">全體團體行程</option>
                {memberList.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {dates.map(d => <button key={d} onClick={() => setSelectedDate(d)} className={`flex-shrink-0 w-12 h-12 rounded-xl text-xs font-bold ${selectedDate === d ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>3/{d.split('/')[2]}</button>)}
              </div>
            </div>
            {filteredSchedule.map((item, i) => (
              <div key={i} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex justify-between mb-2">
                  <span className={`px-2 py-1 rounded text-[10px] font-bold ${CATEGORY_COLORS[item.category] || CATEGORY_COLORS["其他"]}`}>{item.category}</span>
                  <span className="text-xs text-slate-400">{item.time}</span>
                </div>
                <h3 className="font-bold text-slate-800">{item.activity}</h3>
                <p className="text-sm text-slate-500 mt-2 flex items-center gap-1"><MapPin size={14}/> {item.location}</p>
                {item.note && <div className="mt-3 p-3 bg-slate-50 rounded-xl text-xs">{item.note}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col h-[70vh] bg-white rounded-2xl shadow-lg border overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30">
              {messages.map((m, i) => <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`p-3 rounded-2xl text-sm ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border'}`}>{m.text}</div></div>)}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleSendMessage} className="p-4 border-t flex gap-2">
              <input className="flex-1 bg-slate-100 border-none rounded-xl px-4" value={input} onChange={(e) => setInput(e.target.value)} placeholder="詢問行程..." />
              <button className="bg-indigo-600 text-white p-2 rounded-xl"><Send /></button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
