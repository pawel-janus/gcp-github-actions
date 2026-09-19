import { useState } from 'react';
import './App.css';

interface WeatherData {
  temp_C: string;
  weatherDesc: Array<{ value: string }>;
  windspeedKmph: string;
  weatherIconUrl: Array<{ value: string }>;
}

function App() {
  const [city, setCity] = useState('Warsaw');
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWeather = async () => {
    if (!city.trim()) {
      setError('Please enter a city name');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);

      if (!res.ok) {
        throw new Error(`Weather API error: ${res.status}`);
      }

      const data = await res.json();

      if (!data.current_condition?.[0]) {
        throw new Error('Invalid weather data format');
      }

      setWeather(data.current_condition[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch weather');
      setWeather(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <h1>Weather App</h1>
      <p className="subtitle">Powered by wttr.in</p>

      <div className="input-group">
        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchWeather()}
          placeholder="Enter city name"
          className="city-input"
        />
        <button onClick={fetchWeather} disabled={loading} className="fetch-button">
          {loading ? 'Loading...' : 'Get Weather'}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {weather && (
        <div className="weather-card">
          <img
            src={weather.weatherIconUrl[0].value}
            alt={weather.weatherDesc[0].value}
            className="weather-icon"
          />
          <div className="temperature">{weather.temp_C}°C</div>
          <div className="description">{weather.weatherDesc[0].value}</div>
          <div className="wind">Wind: {weather.windspeedKmph} km/h</div>
        </div>
      )}
    </div>
  );
}

export default App;
