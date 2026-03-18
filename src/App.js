import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Link } from 'react-router-dom';
import Login from './components/Login';
import Dishes from './components/Dishes';
import Movies from './components/Movies';
import './App.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  return (
    <Router>
      <div className="App">
        <nav>
          <ul>
            <li><Link to="/">Home</Link></li>
            <li><Link to="/dishes">Dishes</Link></li>
            <li><Link to="/movies">Movies</Link></li>
            <li>{isLoggedIn ? <button onClick={() => setIsLoggedIn(false)}>Logout</button> : <Link to="/login">Login</Link>}</li>
          </ul>
        </nav>

        <Routes>
          <Route path="/" element={<h1>Welcome to FamilyApp</h1>} />
          <Route path="/login" element={<Login setIsLoggedIn={setIsLoggedIn} />} />
          <Route path="/dishes" element={<Dishes />} />
          <Route path="/movies" element={<Movies />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;