import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from './firebase';
import Login from './pages/Login';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Overview from './pages/Overview';
import Members from './pages/Members';
import RiskMap from './pages/RiskMap';
import SDOHAnalysis from './pages/SDOHAnalysis';
import Interventions from './pages/Interventions';
import AIAssistant from './pages/AIAssistant';
import CommunityInterventions from './pages/CommunityInterventions';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-black uppercase tracking-wider text-slate-400">Verifying secure credentials...</p>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <Router>
      <div className="min-h-screen text-on-surface antialiased flex bg-slate-100/40">
        {/* Navigation Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <div className="md:ml-72 flex flex-col min-h-screen w-full md:w-[calc(100%-18rem)] overflow-hidden">
          <Routes>
            <Route 
              path="/" 
              element={
                <>
                  <Header 
                    title="Population Health Portal" 
                    subtitle="Real-time risk intelligence for better member outcomes" 
                  />
                  <main className="p-4 md:p-8 flex flex-col gap-8 w-full flex-1">
                    <Overview />
                  </main>
                </>
              } 
            />
            <Route 
              path="/members" 
              element={
                <>
                  <Header 
                    title="Members Risk Workspace" 
                    subtitle="Filter and analyze individual member clinical and social profiles" 
                  />
                  <main className="p-4 md:p-8 flex flex-col gap-8 w-full flex-1">
                    <Members />
                  </main>
                </>
              } 
            />

            <Route 
              path="/map" 
              element={
                <>
                  <Header 
                    title="Geographic Risk Analysis" 
                    subtitle="Identify hotspots and direct resources based on regional SDOH metrics" 
                  />
                  <main className="p-4 md:p-8 flex flex-col gap-8 w-full flex-1">
                    <RiskMap />
                  </main>
                </>
              } 
            />
            <Route 
              path="/sdoh-analysis" 
              element={
                <>
                  <Header 
                    title="Community SDOH Analytics & Intelligence" 
                    subtitle="Enterprise Power BI reporting and California Census Tract social determinants of health" 
                  />
                  <main className="p-4 md:p-8 flex flex-col gap-8 w-full flex-1">
                    <SDOHAnalysis />
                  </main>
                </>
              } 
            />
            <Route 
              path="/interventions" 
              element={
                <>
                  <Header 
                    title="Priority & Interventions" 
                    subtitle="Decision support recommendations for clinical and social care management" 
                  />
                  <main className="p-4 md:p-8 flex flex-col gap-8 w-full flex-1">
                    <Interventions />
                  </main>
                </>
              } 
            />
            <Route 
              path="/community-interventions" 
              element={
                <>
                  <Header 
                    title="Community Intervention Prioritization" 
                    subtitle="Simulate and track county-level SDOH intervention outreach alerts" 
                  />
                  <main className="p-4 md:p-8 flex flex-col gap-8 w-full flex-1">
                    <CommunityInterventions />
                  </main>
                </>
              } 
            />
            <Route
              path="/ai-assistant"
              element={
                <>
                  <Header
                    title="Patient Risk Understanding Assistant"
                    subtitle="AI-powered explanation of ML predictions for care-management decision support"
                  />
                  <main className="p-4 md:p-6 flex flex-col gap-0 w-full flex-1">
                    <AIAssistant />
                  </main>
                </>
              }
            />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
