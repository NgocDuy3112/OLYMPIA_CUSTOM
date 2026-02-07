import React, { useState } from 'react';
import { User, Question, Match } from '../types';

const ADashboardPage: React.FC = () => {
  // State management
  const [matchCode, setMatchCode] = useState<string>('');
  const [userCode, setUserCode] = useState<string>('');
  const [users, setUsers] = useState<User[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Fetch match data by match code
  const fetchMatchData = async (code: string) => {
    if (!code.trim()) {
      setError('Please enter a match code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // TODO: Replace with actual API endpoint
      const response = await fetch(`/api/matches/${code}`);
      
      if (!response.ok) {
        throw new Error('Match not found');
      }

      const data: Match = await response.json();
      setSelectedMatch(data);
      setUsers(data.users || []);
      setQuestions(data.questions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch match data');
      setUsers([]);
      setQuestions([]);
      setSelectedMatch(null);
    } finally {
      setLoading(false);
    }
  };

  // Update user code
  const updateUserCode = async (userId: string, newCode: string) => {
    setLoading(true);
    setError('');

    try {
      // TODO: Replace with actual API endpoint
      const response = await fetch(`/api/users/${userId}/code`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: newCode }),
      });

      if (!response.ok) {
        throw new Error('Failed to update user code');
      }

      // Update local state
      setUsers(users.map(user => 
        user.id === userId ? { ...user, code: newCode } : user
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user code');
    } finally {
      setLoading(false);
    }
  };

  // Handle match code search
  const handleSearchMatch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMatchData(matchCode);
  };

  // Handle user code update
  const handleUpdateUserCode = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userCode.trim()) {
      setError('Please enter a user code');
      return;
    }

    const user = users.find(u => u.code === userCode);
    if (user) {
      updateUserCode(user.id, userCode);
    } else {
      setError('User not found');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-600 mt-2">Manage matches, users, and questions</p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
            <span className="block sm:inline">{error}</span>
            <button
              className="absolute top-0 bottom-0 right-0 px-4 py-3"
              onClick={() => setError('')}
            >
              <span className="text-2xl">&times;</span>
            </button>
          </div>
        )}

        {/* Search and Input Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Match Code Input */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Search Match</h2>
            <form onSubmit={handleSearchMatch}>
              <div className="space-y-4">
                <div>
                  <label htmlFor="matchCode" className="block text-sm font-medium text-gray-700 mb-2">
                    Match Code
                  </label>
                  <input
                    type="text"
                    id="matchCode"
                    value={matchCode}
                    onChange={(e) => setMatchCode(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter match code"
                    disabled={loading}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
                >
                  {loading ? 'Searching...' : 'Search Match'}
                </button>
              </div>
            </form>
          </div>

          {/* User Code Input */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Update User Code</h2>
            <form onSubmit={handleUpdateUserCode}>
              <div className="space-y-4">
                <div>
                  <label htmlFor="userCode" className="block text-sm font-medium text-gray-700 mb-2">
                    User Code
                  </label>
                  <input
                    type="text"
                    id="userCode"
                    value={userCode}
                    onChange={(e) => setUserCode(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Enter user code"
                    disabled={loading}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
                >
                  {loading ? 'Updating...' : 'Update User Code'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Users Section */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-800">
                Users ({users.length})
              </h2>
            </div>
            <div className="p-6">
              {users.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No users found. Search for a match to view users.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {users.map((user) => (
                    <div
                      key={user.id}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{user.name}</h3>
                          {user.email && (
                            <p className="text-sm text-gray-600 mt-1">{user.email}</p>
                          )}
                          <div className="mt-2 flex items-center space-x-4">
                            <span className="text-sm">
                              <span className="font-medium text-gray-700">Code:</span>{' '}
                              <span className="text-blue-600 font-mono">{user.code}</span>
                            </span>
                            {user.status && (
                              <span
                                className={`px-2 py-1 text-xs font-medium rounded-full ${
                                  user.status === 'active'
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}
                              >
                                {user.status}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Questions Section */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-800">
                Questions ({questions.length})
              </h2>
            </div>
            <div className="p-6">
              {questions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No questions found. Search for a match to view questions.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {questions.map((question) => (
                    <div
                      key={question.id}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
                    >
                      <div className="flex items-start space-x-3">
                        <div className="flex-1">
                          <p className="text-gray-900">{question.content}</p>
                          <div className="mt-2 flex items-center space-x-3">
                            {question.difficulty && (
                              <span
                                className={`px-2 py-1 text-xs font-medium rounded-full ${
                                  question.difficulty === 'easy'
                                    ? 'bg-green-100 text-green-800'
                                    : question.difficulty === 'medium'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {question.difficulty}
                              </span>
                            )}
                            {question.category && (
                              <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
                                {question.category}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Match Info Section (if match is selected) */}
        {selectedMatch && (
          <div className="mt-6 bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Match Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600">Match Name</p>
                <p className="text-lg font-semibold text-gray-900">{selectedMatch.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Match Code</p>
                <p className="text-lg font-semibold text-gray-900 font-mono">{selectedMatch.code}</p>
              </div>
              {selectedMatch.createdAt && (
                <div>
                  <p className="text-sm text-gray-600">Created At</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {new Date(selectedMatch.createdAt).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ADashboardPage;
