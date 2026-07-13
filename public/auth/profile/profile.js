// client-side account profile view - profilee.js

const username = localStorage.getItem('x-userdata-username');
document.documentElement.style.setProperty('--username', `'${username}'`);
document.getElementById('username-title').textContent = username;
const accountCreationDate = localStorage.getItem('x-userdata-accountcreationdate');
const system_status_element = document.getElementById('system-status');
system_status_element.setAttribute('pending', '');


if (username) {
    document.title = `Profile - ${username}`;
}

async function fetchUserData() {
    const res = await fetch(`/profile/api/user/${username}`)
    if (!res.ok) {
        if (res.status == 401 || res.status == 404) {
            localStorage.removeItem('x-userdata-username'); //prevents redirect loops
            localStorage.removeItem('x-userdata-accountcreationdate');
            window.location.href = '/login';
            return
        }
        console.error('Failed to fetch user data:', res.statusText);
        return null;
    }
    const userData = await res.json();
    return userData;
}

async function updateProfileData() {
    const userProfileData = await fetchUserData();
    if (!userProfileData) {
        console.error('No user data available to update profile.');
        return;
    }
    document.dispatchEvent(new CustomEvent("profileDataUpdate", {
        detail: userProfileData

    }));
};



// Initial profile data update
updateProfileData();


const ACCOUNT_TIERS = { //so i can change it easily later if ever needed

    0: {
        name: "Novice",
        color: "#FFE600"
    },
    1: {
        name: "VIP",
        color: "#00FFFF"
    },
    2: {
        name: "Premium",
        color: "#9D00FF"
    },
    3: {
        name: "Admin",
        color: "var(--cy-magenta)"
    }
};

const buttons = {
    account: {
        element: document.getElementById('account-tab'),
        group: 'account'
    },
    singleplayer: {
        element: document.getElementById('singleplayer-tab'),
        group: 'singleplayer'
    },
    multiplayer: {
        element: document.getElementById('multiplayer-tab'),
        group: 'multiplayer'
    },
    friends: {
        element: document.getElementById('friends-tab'),
        group: 'friends'
    }
};

const statFrame = document.getElementById('stat-frame');
Object.values(buttons).forEach(button => {
    button.element.addEventListener('click', () => {
        statFrame.querySelectorAll(".stat-card[group]").forEach(element => {
            element.style.display = element.getAttribute("group") == button.group ? "block" : "none";
        })
    })
})

document.getElementById('account-tab').click(); //default tab


const fields = {

    username: {
        id: "username",
        name: "Username",
        type: "text"
    },

    sp_games_Played: {
        id: "sp_games_Played",
        name: "Games Played",
        type: "number"
    },

    mp_games_Played: {
        id: "mp_games_Played",
        name: "Games Played",
        type: "number"
    },

    mp_games_Won: {
        id: "mp_games_Won",
        name: "Games Won",
        type: "number"
    },

    sp_games_Finished: {
        id: "sp_games_Finished",
        name: "Games Finished",
        type: "number"
    },

    mp_games_Finished: {
        id: "mp_games_Finished",
        name: "Games Finished",
        type: "number"
    },

    sp_average_Score: {
        id: "sp_average_score",
        name: "Average Score",
        type: "score"
    },

    mp_average_Score: {
        id: "mp_average_score",
        name: "Average Score",
        type: "score"
    },

    account_Creation_Date: {
        id: "account_Creation_Date",
        name: "Account Creation Date",
        type: "date"
    },

    last_Login_Date: {
        id: "last_Login_Date",
        name: "Last Login Date",
        type: "date"
    },
};



function formatNumber(value) {

    return Number(value || 0).toLocaleString();

}



function formatScore(value) {

    if (value === null || value === undefined)
        return "NO DATA";

    return formatNumber(value);

}



function formatDate(value, time = true) {

    if (!value)
        return "NO DATA";

    const config = {
        dateStyle: "long",
        ...(time && { timeStyle: "short" })
    };

    const date = new Date(value.replace(" ", "T") + "Z"); //the .replace just clarifys that server gives back utc

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const localeDate = d => d.toLocaleDateString(undefined, {
        dateStyle: "long"
    });

    let formatted = date.toLocaleString(undefined, config);

    if (localeDate(date) === localeDate(today))
        return formatted.replace(localeDate(today), "Today");

    if (localeDate(date) === localeDate(yesterday))
        return formatted.replace(localeDate(yesterday), "Yesterday");

    return formatted;
}



function updateProfile(data) {

    Object.keys(fields).forEach(key => {

        const config = fields[key];


        const element = document.getElementById(config.id)

        if (!element)
            return;


        const element_text = element.querySelector('.stat-p');
        


        switch (config.type) {

            case "score":

                element_text.textContent = config.name + ": " +
                    formatScore(data[key]);

                break;

            case "date":

                if (config.id === 'last_Login_Date') {
                    element_text.textContent = config.name + ": " + formatDate(data[key], true)
                } else { // account creation date
                    element_text.textContent = config.name + ": " + formatDate(data[key], false);
                }
                break;

            case "number":

                element_text.textContent = config.name + ": " +
                    formatNumber(data[key]);

                break;
            default:

                element_text.textContent = config.name + ": " +
                    data[key] ?? "NO DATA";

        }

    });

    document.getElementById("eddies").querySelector('.stat-p')
        .textContent =
        `₿ ${formatNumber(data.eddies)} EDDIES`;

    const tier =
        ACCOUNT_TIERS[data.account_tier] ??
        ACCOUNT_TIERS[0];


    const tierElement =
        document.getElementById("tier-value")

    tierElement.textContent =
        tier.name.toUpperCase();


    tierElement.style.color =
        tier.color;

    tierElement.style.borderColor =
        tier.color;
}

document.addEventListener(
    "profileDataUpdate",
    event => {
        const overlay =
            document.getElementById("syncOverlay");
        overlay.classList.add("sync-active");
        setTimeout(() => {

            updateProfile(event.detail);

            overlay.classList.remove("sync-active");

            system_status_element.removeAttribute('pending');
            system_status_element.textContent = "● CONNECTION VERIFIED";

        }, 350)}
);

if (new URLSearchParams(window.location.search).has('demo')) {
    updateProfile({
        username: 'ghost_runner',
        sp_games_played: 42,
        sp_games_Finished: 38,
        sp_average_score: 812.4,
        mp_games_Played: 130,
        mp_games_Won: 67,
        mp_games_Finished: 121,
        mp_average_score: 940.2,
        account_Creation_Date: '2025-11-02 14:22:10',
        last_login_date: '2026-07-10 09:15:00',
        account_tier: 2,
        eddies: 15420
    });
}