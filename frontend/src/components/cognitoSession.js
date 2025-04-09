import { CognitoUserPool } from 'amazon-cognito-identity-js';
import { poolData } from './cognitoConfig';

const userPool = new CognitoUserPool(poolData);

export function getCurrentSession() {
  return new Promise((resolve, reject) => {
    const currentUser = userPool.getCurrentUser();
    if (!currentUser) {
      return reject(new Error("No current user found"));
    }
    currentUser.getSession((err, session) => {
      if (err) {
        return reject(err);
      }
      resolve({ currentUser, session });
    });
  });
}

export function ensureSessionValid() {
  return getCurrentSession().then(({ currentUser, session }) => {
    const expiration = session.getAccessToken().getExpiration() * 1000;
    const now = Date.now();
    if (expiration - now < 5 * 60 * 1000) {
      return new Promise((resolve, reject) => {
        currentUser.refreshSession(session.getRefreshToken(), (err, newSession) => {
          if (err) {
            return reject(err);
          }
          resolve(newSession);
        });
      });
    } else {
      return session;
    }
  });
}

export async function getCurrentUserEmail() {
  try {
    const session = await ensureSessionValid();
    return session.getIdToken().payload.email;
  } catch (err) {
    console.error("Error ensuring session is valid:", err);
    throw err;
  }
}
