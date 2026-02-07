# OLYMPIA CUSTOM - Admin Dashboard

A modern admin dashboard for managing Olympia matches, users, and questions. Built with React, TypeScript, and Tailwind CSS.

## 🚀 Features

- **Match Management**: Search and view matches by code
- **User Management**: Display and update user codes
- **Question Management**: View questions with difficulty levels and categories
- **Responsive Design**: Mobile-friendly layout using Tailwind CSS
- **Type Safety**: Built with TypeScript for better code quality and developer experience

## 📋 Prerequisites

- Node.js (v18 or higher)
- npm or yarn

## 🛠️ Installation

1. Clone the repository:
```bash
git clone https://github.com/NgocDuy3112/OLYMPIA_CUSTOM.git
cd OLYMPIA_CUSTOM
```

2. Install dependencies:
```bash
npm install
```

## 🏃 Running the Application

### Development Mode
```bash
npm run dev
```
The application will be available at `http://localhost:5173`

### Build for Production
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

## 📁 Project Structure

```
OLYMPIA_CUSTOM/
├── src/
│   ├── pages/
│   │   ├── ADashboardPage.tsx       # Main dashboard with API integration
│   │   └── ADashboardPageDemo.tsx   # Demo version with mock data
│   ├── types/
│   │   └── index.ts                 # TypeScript type definitions
│   ├── App.tsx                      # Root component
│   ├── main.tsx                     # Application entry point
│   └── index.css                    # Global styles with Tailwind directives
├── index.html                       # HTML template
├── package.json                     # Dependencies and scripts
├── tsconfig.json                    # TypeScript configuration
├── vite.config.ts                   # Vite configuration
├── tailwind.config.cjs              # Tailwind CSS configuration
└── postcss.config.cjs               # PostCSS configuration
```

## 🎨 Components

### ADashboardPage
The production-ready dashboard component with the following features:

- **Search Match**: Search for matches by entering a match code
- **Update User Code**: Update user codes for match participants
- **Users Display**: View all users in a match with their details (code, email, status)
- **Questions Display**: View all questions with difficulty levels and categories
- **Match Information**: Display current match details

### ADashboardPageDemo
A demonstration version with mock data to showcase the UI without requiring API integration.

## 🔌 API Integration

The `ADashboardPage` component is designed to integrate with the following API endpoints:

### Get Match by Code
```
GET /api/matches/{matchCode}
```
Returns: Match object with users and questions

### Update User Code
```
PUT /api/users/{userId}/code
```
Body: `{ "code": "newCode" }`

## 🎯 Type Definitions

### User
```typescript
interface User {
  id: string;
  code: string;
  name: string;
  email?: string;
  status?: 'active' | 'inactive';
}
```

### Question
```typescript
interface Question {
  id: string;
  content: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  category?: string;
}
```

### Match
```typescript
interface Match {
  id: string;
  code: string;
  name: string;
  users: User[];
  questions: Question[];
  createdAt?: string;
}
```

## 🎨 UI Screenshots

### Empty State
![Empty Dashboard](https://github.com/user-attachments/assets/59b86955-3440-4508-bf1a-2f36c94a2268)

### With Data
![Dashboard with Data](https://github.com/user-attachments/assets/b2ec03fd-9c66-4075-b1fd-55d47a2dffda)

## 🛡️ Technologies Used

- **React 19**: JavaScript library for building user interfaces
- **TypeScript 5**: Typed superset of JavaScript
- **Tailwind CSS 4**: Utility-first CSS framework
- **Vite 7**: Next-generation frontend build tool

## 📝 Development Notes

- The project uses ES modules (type: "module" in package.json)
- Tailwind CSS v4 requires `@tailwindcss/postcss` plugin
- TypeScript strict mode is enabled for better type safety
- The demo component uses mock data for testing and presentation purposes

## 🔧 Configuration Files

- **tsconfig.json**: TypeScript compiler options
- **vite.config.ts**: Vite build configuration
- **tailwind.config.cjs**: Tailwind CSS configuration
- **postcss.config.cjs**: PostCSS plugins configuration

## 📄 License

ISC

## 👥 Author

NgocDuy3112

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

