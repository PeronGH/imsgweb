/** Flipped by the api fetch wrapper on any 401; App shows the login
 *  screen. Cleared by reloading after a successful login. */
class Auth {
  required = $state(false);
}

export const auth = new Auth();
