import React from 'react';

const SetUserType = () => {
  // Function to set user type and reload the page
  const setUserType = (type) => {
    sessionStorage.setItem('userType', type);
    // Optional: reload to apply changes immediately
    window.location.reload();
  };

  const types = ['gold', 'silver', 'trial'];

  return (
    <div className="mt-3 p-3 bg-light rounded" style={{ position: 'fixed', bottom: '10px', right: '10px', zIndex: 9999 }}>
      <h6>Dev Tools: Set User Type</h6>
      <div className="d-flex gap-2">
        {types.map(type => (
          <button 
            key={type}
            className={`btn btn-sm btn-${type === 'gold' ? 'warning' : (type === 'silver' ? 'secondary' : 'info')}`}
            onClick={() => setUserType(type)}
          >
            {type.toUpperCase()}
          </button>
        ))}
      </div>
      <small className="text-muted d-block mt-2">Current: {sessionStorage.getItem('userType') || 'none'}</small>
    </div>
  );
};

export default SetUserType; 