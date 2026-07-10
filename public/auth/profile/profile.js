// client-side account profile view - profilee.js
const username = localStorage.getItem('x-userdata-username');
const accountCreationDate = localStorage.getItem('x-userdata-accountcreationdate');

if (username) {
    document.title = `Profile - ${username}`;
}

async function fetchUserData() {
    const res = await fetch(`/profile/api/user/${username}`)
    if (!res.ok) {
        console.error('Failed to fetch user data:', res.statusText);
        return null;
    }
    const userData = await res.json();
    return userData;
}


