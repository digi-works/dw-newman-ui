# Newman Campus Assistant

A production-grade, AI-powered campus assistant built for Newman University. This application features a dual-workspace design: a conversational AI interface powered by Flowise, and a real-time Room Bookings dashboard connected to NeonDB (PostgreSQL).

## ✨ Features

* **Dual Workspace Layout**: Seamlessly toggle between the AI Chat and the Bookings Dashboard.
* **Flowise AI Integration**: Real-time streaming AI responses with a custom `ChatWorkspace` component.
* **Production Chat UI**:
  * Unique Session IDs to sandbox user memory securely.
  * Sidebar chat history with native dropdowns for renaming and deleting.
  * "Gemini-style" expandable/collapsible thought process UI with CSS grid animations.
  * Auto-titling of new chats based on the first prompt.
* **Generative UI**: Automatically detects when the AI requests booking details and injects a native, interactive React form directly into the chat stream.
* **Real-time Bookings Dashboard**: Fetches and filters PostgreSQL data from NeonDB with views for Upcoming, Confirmed, Tentative, and Declined bookings.
* **Theming**: Pixel-perfect Light and Dark modes using CSS variables.

---

## 🛠 Tech Stack

* **Framework**: [Next.js](https://nextjs.org/) (App Router / React)
* **AI Backend**: [Flowise](https://flowiseai.com/)
* **Database**: [NeonDB](https://neon.tech/) (Serverless PostgreSQL)
* **Agent Toolkit**: [CopilotKit](https://docs.copilotkit.ai/)
* **Icons**: [Lucide React](https://lucide.dev/)
* **Styling**: Standard CSS (Custom Variables & Grid Animations)

---

## ⚙️ Prerequisites

Before you begin, ensure you have the following installed:
* [Node.js](https://nodejs.org/en/) (v18 or higher)
* `npm`, `yarn`, or `pnpm`

You will also need active endpoints for:
1. **NeonDB**: A PostgreSQL connection string.
2. **Flowise**: Your deployed Flowise chatflow API endpoint.

---

## 🚀 Installation & Setup

**1. Clone the repository**
```bash
git clone https://github.com/digi-works/dw-newman-ui
cd dw-newman-ui
```

**2. Install dependencies**
Install the standard Next.js dependencies, followed by the specific packages required for the UI and AI integration:

```bash
# Install base dependencies
npm install

# Install required packages for icons and CopilotKit integration
npm install lucide-react @copilotkit/react-core
```

*(If you are using yarn, run `yarn install` and `yarn add lucide-react @copilotkit/react-core`)*

**3. Configure Environment Variables**
Create a `.env` file in the root of your project and add your keys. 


**4. Add Static Assets**
Ensure the following images are placed in the `/public` folder at the root of the project:

* `newman-logo.png` (Used in the top navigation bar)
* `newman-chat.png` (Used as the AI's avatar in the chat)

**5. Run the Development Server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

---

## 📁 Key Folder Structure

```text
├── public/
│   ├── newman-logo.png         # Navbar logo
│   └── newman-chat.png         # AI chat avatar
├── src/
│   ├── app/
│   │   ├── page.tsx            # Main layout, sidebar state, and routing
│   │   ├── globals.css         # Global styling, themes, and animations
│   │   └── api/                # Next.js API routes (NeonDB & CopilotKit)
│   ├── components/
│   │   ├── ChatWorkspace.tsx   # Flowise streaming, thinking UI, Generative Form
│   │   └── BookingsWorkspace.tsx # NeonDB table UI, status filters
│   └── types/
│       └── index.ts            # TypeScript interfaces (ChatSession, etc.)
```

---

## 🧠 Using the Generative UI Booking Form

The chat interface is programmed to intelligently detect booking intents.
If the Flowise AI responds with a message containing both `"Full name"` and `"Student ID"`, the frontend will automatically intercept the text and render the interactive `<BookingDetailsForm />` inside the chat bubble.

To test this, prompt the AI:

> *"I want to book the Alumni Board Room for 13 people on August 30th."*

