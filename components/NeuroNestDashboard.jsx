import {
  Bell,
  Calendar,
  Camera,
  Check,
  ChevronRight,
  FileText,
  Folder,
  Home,
  Layers,
  MapPin,
  MessageCircle,
  Mic,
  Navigation,
  Search,
  Send,
  Settings,
  Sparkles,
  Tag,
  Trash2,
  UserRound,
  WandSparkles,
} from "lucide-react";
import "./neuronest-dashboard.css";

const navItems = [
  { label: "Home", icon: Home, active: true },
  { label: "AI Chat", icon: MessageCircle },
  { label: "Timeline", icon: Calendar },
  { label: "Memories", icon: Folder },
  { label: "Map View", icon: MapPin },
  { label: "Places", icon: Navigation },
  { label: "Insights", icon: Sparkles },
  { label: "Tags", icon: Tag },
  { label: "Voice Notes", icon: Mic },
  { label: "Trash", icon: Trash2 },
];

const memoryCards = [
  {
    eyebrow: "Forgotten Gold",
    title: "Startup idea from 4 months ago",
    body: "You were working on an AI tutoring platform.",
    accent: "violet",
  },
  {
    eyebrow: "Place Visited",
    title: "Blue Bottle Cafe",
    body: "You visited 3 times in the last 2 weeks.",
    accent: "green",
    image: "cafe",
  },
  {
    eyebrow: "Memory Connection",
    title: "This idea matches something you saved in February.",
    body: "AI Project -> AI Tutoring",
    accent: "blue",
  },
  {
    eyebrow: "Insight",
    title: "You save most of your ideas at night.",
    body: "Active between 10 PM - 2 AM",
    accent: "orange",
  },
];

const recentMemories = [
  { type: "Screenshot", title: "Upper Body Workout", time: "Today, 8:30 PM", image: "gym" },
  { type: "Place", title: "Sorrento Restaurant", time: "Today, 7:15 PM", image: "pizza" },
  { type: "Note", title: "Business Idea", time: "Today, 2:40 PM", image: "note" },
  { type: "Place", title: "Manali Trip", time: "Yesterday", image: "mountain" },
  { type: "Document", title: "Book Notes", time: "2 days ago", image: "doc" },
];

const moments = [
  { time: "9:15 AM", icon: FileText, image: "screen" },
  { time: "11:20 AM", icon: MapPin, image: "photo" },
  { time: "12:47 PM", icon: Sparkles, image: "dashboard" },
  { time: "3:10 PM", icon: Tag, image: "desk" },
  { time: "5:45 PM", icon: Mic, image: "night" },
  { time: "8:30 PM", icon: Camera, image: "lake" },
  { time: "10:15 PM", icon: Calendar, image: "moon" },
];

function Sidebar() {
  return (
    <aside className="nn-sidebar">
      <div className="nn-brand">
        <div className="nn-logo">
          <Sparkles size={24} />
        </div>
        <div>
          <h1>NeuroNest</h1>
          <p>AI Second Brain Memory System</p>
        </div>
      </div>

      <div className="nn-promise">
        <strong>Never forget your life again.</strong>
        <span>Your AI automatically remembers everything that matters.</span>
      </div>

      <nav className="nn-nav" aria-label="Primary navigation">
        {navItems.map(({ label, icon: Icon, active }) => (
          <button className={active ? "active" : ""} key={label} type="button">
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <button className="nn-assistant" type="button">
        <span className="nn-orb">
          <WandSparkles size={17} />
        </span>
        <span>
          <strong>AI Assistant</strong>
          <small>Always here to help</small>
        </span>
      </button>
    </aside>
  );
}

function SearchHero() {
  return (
    <section className="nn-panel nn-dashboard-head">
      <div className="nn-section-title">
        <h2>Dashboard</h2>
        <div className="nn-head-actions">
          <Bell size={18} />
          <span className="nn-avatar">JN</span>
        </div>
      </div>

      <form className="nn-search">
        <Search size={20} />
        <input placeholder="Ask your memories anything..." />
        <button aria-label="Send memory search" type="button">
          <Send size={18} />
        </button>
      </form>

      <div className="nn-chips">
        <button type="button">Find that cafe I visited last month</button>
        <button type="button">Show my gym workout plan</button>
        <button type="button">What did I save about AI?</button>
        <button type="button">Where did I go last Friday?</button>
      </div>
    </section>
  );
}

function MemoryFeed() {
  return (
    <section className="nn-feed">
      <div className="nn-section-title">
        <h2>AI Memory Feed</h2>
        <button type="button">See all</button>
      </div>
      <div className="nn-memory-grid">
        {memoryCards.map((card) => (
          <article className={`nn-memory-card ${card.accent}`} key={card.title}>
            <span>{card.eyebrow}</span>
            <h3>{card.title}</h3>
            <p>{card.body}</p>
            {card.image ? <div className={`nn-card-image ${card.image}`} /> : <div className="nn-neural-art" />}
            <button type="button">View Memory</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Moments() {
  return (
    <section className="nn-panel nn-moments">
      <div className="nn-section-title">
        <h2>Today's Moments</h2>
        <div className="nn-tabs">
          {["All", "Places", "Screenshots", "Notes", "Voice"].map((item, index) => (
            <button className={index === 0 ? "active" : ""} key={item} type="button">
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="nn-moment-rail">
        {moments.map(({ time, icon: Icon, image }) => (
          <div className="nn-moment" key={time}>
            <div className={`nn-thumb ${image}`}>
              <span>
                <Icon size={15} />
              </span>
            </div>
            <small>{time}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecentMemories() {
  return (
    <section className="nn-panel nn-recent">
      <div className="nn-section-title">
        <h2>Recent Memories</h2>
        <button type="button">See all</button>
      </div>
      <div className="nn-recent-grid">
        {recentMemories.map((memory) => (
          <article className="nn-recent-card" key={memory.title}>
            <div className={`nn-recent-image ${memory.image}`} />
            <span>{memory.type}</span>
            <h3>{memory.title}</h3>
            <p>{memory.time}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function WeeklyRecap() {
  return (
    <section className="nn-panel nn-recap">
      <div className="nn-recap-copy">
        <h2>AI Weekly Recap</h2>
        <p>May 12 - May 18, 2026</p>
        <div className="nn-stat-row">
          {[
            ["Places Visited", "12", MapPin],
            ["Memories Saved", "68", Folder],
            ["Screenshots", "34", Camera],
            ["Voice Notes", "7", Mic],
          ].map(([label, value, Icon]) => (
            <div className="nn-stat" key={label}>
              <Icon size={18} />
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="nn-highlights">
        <h3>Top Highlights</h3>
        <p>You explored 8 new places</p>
        <p>Most visited category: Cafes</p>
        <p>You saved more productivity content</p>
      </div>
      <div className="nn-mood-ring">
        <span>Mood</span>
        <strong>Great</strong>
        <small>:-)</small>
      </div>
    </section>
  );
}

function MapView() {
  return (
    <section className="nn-panel nn-map-panel">
      <div className="nn-section-title">
        <h2>Map View</h2>
      </div>
      <div className="nn-map">
        <div className="nn-map-tools">
          <button type="button" aria-label="Layers">
            <Layers size={16} />
          </button>
          <button type="button" aria-label="Filter">
            <Settings size={16} />
          </button>
          <button type="button" aria-label="Places">
            <MapPin size={16} />
          </button>
        </div>
        {[
          ["pin-a", "violet"],
          ["pin-b", "blue"],
          ["pin-c", "orange"],
          ["pin-d", "green"],
          ["pin-e", "pink"],
        ].map(([className, color]) => (
          <span className={`nn-map-pin ${className} ${color}`} key={className}>
            <MapPin size={18} fill="currentColor" />
          </span>
        ))}
        <article className="nn-map-card">
          <div className="nn-map-photo" />
          <h3>Blue Bottle Cafe</h3>
          <p>Cafe · 0.4 km</p>
          <strong>4.5 (230)</strong>
          <small>Visited 3 times</small>
        </article>
      </div>
    </section>
  );
}

function ChatPanel() {
  return (
    <section className="nn-panel nn-chat">
      <h2>AI Chat</h2>
      <div className="nn-chat-stream">
        <p className="from-user">What restaurant did I visit last Friday?</p>
        <article>
          <span>You visited Sorrento Restaurant on Friday, May 16 at 7:30 PM.</span>
          <div className="nn-chat-place">
            <div className="nn-chat-photo" />
            <div>
              <strong>Sorrento Restaurant</strong>
              <small>Italian Restaurant · 1.2 km</small>
              <small>4.4 (120)</small>
            </div>
          </div>
        </article>
        <article>
          <span>You also saved a note about it.</span>
          <p>Great pasta and ambience. Try their tiramisu!</p>
        </article>
      </div>
      <form className="nn-chat-input">
        <input placeholder="Ask anything about your memories..." />
        <Mic size={17} />
        <button aria-label="Send chat message" type="button">
          <Send size={17} />
        </button>
      </form>
    </section>
  );
}

function PhonePreview() {
  return (
    <section className="nn-phone" aria-label="Mobile preview">
      <div className="nn-phone-screen">
        <div className="nn-phone-top">
          <span>9:41</span>
          <span>5G</span>
        </div>
        <div className="nn-phone-title">
          <span className="nn-orb">
            <Sparkles size={15} />
          </span>
          <strong>NeuroNest</strong>
          <Settings size={17} />
        </div>
        <p>Good Morning, JAI</p>
        <div className="nn-phone-search">Ask your memories...</div>
        <h3>Today's Moments</h3>
        <div className="nn-phone-moments">
          {moments.slice(0, 4).map((moment) => (
            <div className={`nn-thumb ${moment.image}`} key={moment.time} />
          ))}
        </div>
        <div className="nn-phone-insight">
          <span>AI Insight</span>
          <strong>You are most productive between 10 AM - 1 PM</strong>
        </div>
        <div className="nn-phone-memory">
          <div className="nn-recent-image cafe" />
          <div>
            <strong>Blue Bottle Cafe</strong>
            <small>Today, 10:42 AM</small>
          </div>
          <ChevronRight size={17} />
        </div>
        <div className="nn-mobile-nav">
          <Home size={17} />
          <MessageCircle size={17} />
          <button type="button">+</button>
          <Calendar size={17} />
          <UserRound size={17} />
        </div>
      </div>
    </section>
  );
}

export default function NeuroNestDashboard() {
  return (
    <main className="nn-shell">
      <Sidebar />
      <div className="nn-main">
        <SearchHero />
        <MemoryFeed />
        <Moments />
        <RecentMemories />
        <WeeklyRecap />
      </div>
      <div className="nn-side">
        <MapView />
        <div className="nn-side-grid">
          <ChatPanel />
          <PhonePreview />
        </div>
        <section className="nn-panel nn-style-strip">
          <div>
            <h2>Color Palette</h2>
            <div className="nn-swatches">
              {["#0b0d17", "#111827", "#1a1f2e", "#7c3aed", "#06b6d4", "#22c55e", "#f59e0b", "#ef4444", "#ffffff"].map(
                (color) => (
                  <span key={color} style={{ background: color }} title={color} />
                ),
              )}
            </div>
          </div>
          <div>
            <h2>Icon Style</h2>
            <div className="nn-icon-row">
              {[Home, MessageCircle, MapPin, Calendar, Folder, Mic, Settings, Check].map((Icon, index) => (
                <Icon key={index} size={22} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
