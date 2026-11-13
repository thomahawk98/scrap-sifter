// Manage the title flow before creating a game session or joining a lobby.
export default class MainMenu {
    constructor(root, assetLoader, onJoinLobby) {
        this.root = root;
        this.assetLoader = assetLoader;
        this.onJoinLobby = onJoinLobby;
        this.lobbies = [];
        this.joining = false;
        this.root.addEventListener('click', event => this.handleClick(event));
        this.showAudioPrompt();
    }

    // Route menu button clicks without exposing server lobby data as HTML.
    async handleClick(event) {
        const button = event.target.closest('button[data-action]');
        if (!button && this.root.classList.contains('menu-intro')) {
            try {
                await this.assetLoader.audioContext?.resume();
            } catch (error) {
                console.warn('Could not enable audio:', error);
            }
            this.showTitle();
            return;
        }
        if (!button || this.joining) return;

        switch (button.dataset.action) {
            case 'enable-audio':
                try {
                    await this.assetLoader.audioContext?.resume();
                } catch (error) {
                    console.warn('Could not enable audio:', error);
                }
                this.showTitle();
                break;
            case 'play':
                await this.showLobbies();
                break;
            case 'credits':
                this.root.querySelector('.credits').hidden = false;
                break;
            case 'close-credits':
                this.root.querySelector('.credits').hidden = true;
                break;
            case 'back':
                this.showTitle();
                break;
            case 'join':
                this.joining = true;
                button.disabled = true;
                button.textContent = 'Joining…';
                this.root.querySelector('.menu-error').textContent = '';
                const lobby = this.lobbies.find(candidate => String(candidate.id) === button.dataset.lobbyId);
                if (!lobby) {
                    this.joining = false;
                    await this.showLobbies();
                    return;
                }
                this.onJoinLobby(lobby, {
                    onJoined: () => this.root.classList.add('hidden'),
                    onError: async message => {
                        this.joining = false;
                        await this.showLobbies();
                        this.root.querySelector('.menu-error').textContent = message;
                    },
                });
                break;
        }
    }

    // Show the required silent black screen until the player enables audio.
    showAudioPrompt() {
        this.root.className = 'menu-screen menu-intro';
        this.root.innerHTML = '<button class="audio-prompt" data-action="enable-audio">Click to enable audio</button>';
    }

    // Render the title screen with its panoramic image and credits overlay.
    showTitle() {
        this.root.className = 'menu-screen menu-title';
        this.root.innerHTML = `
            <main class="title-content">
                <h1>Spaceships</h1>
                <div class="title-options">
                    <button data-action="play">Play</button>
                    <button data-action="credits">Credits</button>
                </div>
            </main>
            <section class="credits" hidden>
                <div class="credits-card">
                    <h2>Credits</h2>
                    <p>Thanks for playing.</p>
                    <button data-action="close-credits">Back</button>
                </div>
            </section>`;
    }

    // Fetch currently registered server worlds and present them as joinable lobbies.
    async showLobbies() {
        this.root.className = 'menu-screen menu-lobbies';
        this.root.innerHTML = `
            <main class="lobby-content">
                <h1>Select a lobby</h1>
                <p class="menu-error" role="status"></p>
                <div class="lobby-list"></div>
                <button data-action="back">Back</button>
            </main>`;

        try {
            const response = await fetch('/api/lobbies');
            if (!response.ok) throw new Error(`Lobby list request failed (${response.status}).`);
            this.lobbies = await response.json();
            const list = this.root.querySelector('.lobby-list');
            if (this.lobbies.length === 0) {
                list.textContent = 'No open lobbies.';
                return;
            }
            for (const lobby of this.lobbies) {
                const button = document.createElement('button');
                button.dataset.action = 'join';
                button.dataset.lobbyId = lobby.id;
                button.className = 'lobby-entry';
                const name = document.createElement('strong');
                name.textContent = lobby.name;
                const count = document.createElement('span');
                count.textContent = `${lobby.players} ${lobby.players === 1 ? 'player' : 'players'}`;
                button.append(name, count);
                list.append(button);
            }
        } catch (error) {
            this.root.querySelector('.menu-error').textContent = 'Could not load lobbies. Try again.';
            console.error('Could not load lobbies:', error);
        }
    }
}
