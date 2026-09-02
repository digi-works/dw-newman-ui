"use client";
import { useState, useEffect } from 'react';
import {
  Sun, Moon,
  Trash2, Pencil, Check, MoreHorizontal
} from 'lucide-react';
import BookingsWorkspace from '@/components/BookingsWorkspace';
import ChatWorkspace from '@/components/ChatWorkspace';
import { RegisterBookingsTable } from "@/components/action-renderers";
import type { ChatSession } from '@/types';

export default function Page() {
  const [activeTab, setActiveTab] = useState<'chat' | 'bookings' | 'analytics'>('chat');
  const [isDark, setIsDark] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // --- THE FIX: Unique Session ID Generation ---
  // Lazy initialization ensures this only runs once when the user first loads the app
  const [chats, setChats] = useState<ChatSession[]>(() => {
    const uniqueId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    return [{ id: uniqueId, title: 'New Chat', messages: [], updatedAt: Date.now() }];
  });
  
  // Set the active chat to the unique ID we just generated
  const [activeChatId, setActiveChatId] = useState<string>(() => chats[0].id);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  const activeChat = chats.find(c => c.id === activeChatId) || chats[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setOpenDropdownId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const createNewChat = () => {
    // Generate a new unique ID for every single new chat
    const newId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    setChats([{ id: newId, title: 'New Chat', messages: [], updatedAt: Date.now() }, ...chats]);
    setActiveChatId(newId);
    setOpenDropdownId(null);
    setDrawerOpen(false);
  };

  const deleteChat = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); 
    e.nativeEvent.stopImmediatePropagation();
    const updatedChats = chats.filter(c => c.id !== id);
    
    if (updatedChats.length === 0) {
      // Generate a new unique ID if they delete their last chat
      const newId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      setChats([{ id: newId, title: 'New Chat', messages: [], updatedAt: Date.now() }]);
      setActiveChatId(newId);
    } else {
      setChats(updatedChats);
      if (activeChatId === id) setActiveChatId(updatedChats[0].id);
    }
    setOpenDropdownId(null);
  };

  const startEditing = (e: React.MouseEvent, chat: ChatSession) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    setEditingId(chat.id);
    setEditTitle(chat.title);
    setOpenDropdownId(null);
  };

  const saveEdit = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.stopPropagation();
      if ('nativeEvent' in e) e.nativeEvent.stopImmediatePropagation();
    }
    if (editingId && editTitle.trim()) {
      setChats(chats.map(c => c.id === editingId ? { ...c, title: editTitle.trim() } : c));
    }
    setEditingId(null);
  };

  const toggleDropdown = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation(); 
    setOpenDropdownId(openDropdownId === id ? null : id);
  };

  return (
    <>
      <RegisterBookingsTable />
      
      <div className={`app-wrapper ${isDark ? 'dark-theme' : ''}`}>
        
        {/* Top Navbar */}
        <header className="navbar">
          <div className="nav-left">
            <button
              type="button"
              className="nav-hamburger"
              onClick={() => setDrawerOpen((v) => !v)}
              aria-label="Menu"
            >
              ☰
            </button>
            <img src="/newman-logo.svg" alt="Newman University" className="nav-logo-img" />
            <div className="nav-brand-divider" />
            <div className="nav-brand">
              <span className="nav-title">Assistant</span>
              <span className="nav-brand-kicker">Campus Hero</span>
            </div>
          </div>

          <nav className="nav-center">
            <button className={`nav-btn ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => { setActiveTab('chat'); setDrawerOpen(false); }}>
              Chat
            </button>
            <button className={`nav-btn ${activeTab === 'bookings' ? 'active' : ''}`} onClick={() => { setActiveTab('bookings'); setDrawerOpen(false); }}>
              Bookings
            </button>
            {/* ANALYTICS TAB (disabled for now — uncomment to re-enable)
            <button className={`nav-btn ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => { setActiveTab('analytics'); setDrawerOpen(false); }}>
              Analytics
            </button>
            */}
          </nav>

          <div className="nav-right">
            <span className="nav-user-label">Facilities Office</span>
            <button
              type="button"
              className="nav-theme-btn"
              onClick={() => setIsDark(!isDark)}
              aria-label="Toggle theme"
            >
              {isDark ? <Sun size={18} color="#fbbf24" /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        {/* Main Workspace Area */}
        <main className="main-content" data-drawer={drawerOpen ? 'open' : undefined}>
          
          {/* CHAT TAB */}
          {activeTab === 'chat' && (
            <div style={{ display: 'flex', width: '100%', height: '100%' }}>
              <aside className="sidebar">
                <button className="new-chat-btn" onClick={createNewChat}>
                  <span className="nc-plus" aria-hidden="true">+</span> New conversation
                </button>

                <div className="sidebar-label">Recent</div>

                <div className="chat-history">
                  {chats.map(chat => (
                    <div
                      key={chat.id}
                      className={`history-item ${activeChatId === chat.id ? 'active' : ''}`}
                      onClick={() => {
                        if (editingId !== chat.id) {
                          setActiveChatId(chat.id);
                          setDrawerOpen(false);
                        }
                      }}
                    >
                      {editingId === chat.id ? (
                        <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: '4px', height: '20px' }}>
                          <input
                            autoFocus
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveEdit(e)}
                            style={{ flex: 1, background: 'var(--input-bg)', color: 'var(--text-main)', border: '1px solid var(--brand)', borderRadius: '4px', padding: '0 6px', fontSize: '13px', outline: 'none', height: '22px' }}
                            onClick={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
                          />
                          <button className="chat-actions-btn" onClick={saveEdit} style={{ display: 'block', color: 'var(--green)', padding: '2px' }}>
                            <Check size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="history-item-title">{chat.title}</span>
                          
                          <div style={{ position: 'relative', marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                            <button 
                              className="chat-actions-btn" 
                              onClick={(e) => toggleDropdown(e, chat.id)}
                              style={{ display: openDropdownId === chat.id ? 'block' : undefined }} 
                            >
                              <MoreHorizontal size={16} />
                            </button>

                            {openDropdownId === chat.id && (
                              <div 
                                className="chat-dropdown" 
                                onClick={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
                              >
                                <button onClick={(e) => startEditing(e, chat)}>
                                  <Pencil size={14} /> Rename
                                </button>
                                <button
                                  onClick={(e) => deleteChat(e, chat.id)}
                                  style={{ color: 'var(--brand)' }}
                                >
                                  <Trash2 size={14} /> Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </aside>

              <ChatWorkspace 
                activeChat={activeChat} 
                activeChatId={activeChatId} 
                setChats={setChats} 
              />
            </div>
          )}

          {/* BOOKINGS TAB */}
          {activeTab === 'bookings' && (
            <BookingsWorkspace
              onBookRoom={() => setActiveTab('chat')}
              onCloseDrawer={() => setDrawerOpen(false)}
            />
          )}

          {/* ANALYTICS TAB (disabled for now — uncomment to re-enable, and re-add
              `import AnalyticsWorkspace from '@/components/AnalyticsWorkspace';` at the top)
          {activeTab === 'analytics' && (
            <AnalyticsWorkspace />
          )}
          */}

        </main>

        <div
          className={`drawer-overlay ${drawerOpen ? 'open' : ''}`}
          onClick={() => setDrawerOpen(false)}
        />
      </div>
    </>
  );
}