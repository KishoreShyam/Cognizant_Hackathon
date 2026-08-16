import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Overview from './pages/Overview';
import Members from './pages/Members';
import ClinicalRisk from './pages/ClinicalRisk';
import RiskMap from './pages/RiskMap';
import Interventions from './pages/Interventions';

function App() {
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
              path="/clinical" 
              element={
                <>
                  <Header 
                    title="Clinical Risk Analytics" 
                    subtitle="Evaluate clinical cohorts and individual condition drivers" 
                  />
                  <main className="p-4 md:p-8 flex flex-col gap-8 w-full flex-1">
                    <ClinicalRisk />
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
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
