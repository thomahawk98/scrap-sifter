// Manage audio activation, title navigation, and server lobby selection.
export default class MainMenu {
    constructor(root, assetLoader, menuSocket, onJoinLobby) {
        this.root = root;
        this.assetLoader = assetLoader;
        this.menuSocket = menuSocket;
        this.onJoinLobby = onJoinLobby;
        this.lobbies = [];
        this.joining = false;
        this.root.addEventListener('click', event => this.handleClick(event));
        this.root.addEventListener('submit', event => this.handleSubmit(event));
        this.root.addEventListener('change', event => this.handleSettingsChange(event));
        this.root.addEventListener('input', event => {
            if (event.target.matches('[name="name"]')) event.target.dataset.userEdited = 'true';
        });
        this.menuSocket.on('connect', () => {
            const name = this.root.querySelector('[name="name"]');
            if (name && name.dataset.userEdited !== 'true') name.value = this.getDefaultLobbyName();
        });
        this.showAudioPrompt();
    }

    // Route menu buttons and preserve server-provided values as text, not markup.
    async handleClick(event) {
        const button = event.target.closest('button[data-action]');
        if (!button && this.root.classList.contains('menu-intro')) {
            await this.enableAudio();
            return;
        }
        if (!button || this.joining) return;

        switch (button.dataset.action) {
            case 'enable-audio':
                await this.enableAudio();
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
            case 'create-lobby':
                this.showCreateLobby();
                break;
            case 'edit-lobby': {
                const lobby = this.lobbies.find(candidate => String(candidate.id) === button.dataset.lobbyId);
                if (lobby) this.showCreateLobby(lobby);
                break;
            }
            case 'delete-lobby':
                await this.deleteLobby(button.dataset.lobbyId);
                break;
            case 'cancel-create':
                await this.showLobbies();
                break;
            case 'join': {
                const lobby = this.lobbies.find(candidate => String(candidate.id) === button.dataset.lobbyId);
                if (!lobby) {
                    await this.showLobbies();
                    return;
                }
                if (lobby.status === 'private') this.showPasswordPrompt(lobby);
                else this.joinLobby(lobby, '');
                break;
            }
            case 'cancel-password':
                this.root.querySelector('.password-dialog').remove();
                break;
        }
    }

    // Handle form submissions for lobby creation and private-lobby access.
    async handleSubmit(event) {
        const form = event.target.closest('form[data-action]');
        if (!form || this.joining) return;
        event.preventDefault();

        if (form.dataset.action === 'create-lobby') {
            await this.createLobby(form);
            return;
        }
        if (form.dataset.action === 'private-password') {
            const password = new FormData(form).get('accessCode');
            this.joinLobby(this.pendingPrivateLobby, String(password ?? ''));
        }
        if (form.dataset.action === 'edit-lobby') await this.createLobby(form);
    }

    // Toggle password and finite-world fields to match their selected options.
    handleSettingsChange(event) {
        if (event.target.matches('[name="status"]')) {
            const needsPassword = event.target.value === 'private';
            this.root.querySelector('.lobby-password-field').hidden = !needsPassword;
            const password = this.root.querySelector('[name="accessCode"]');
            password.required = needsPassword && this.editingLobby?.status !== 'private';
        }
    }

    // Resume audio from the user's click before opening the title screen.
    async enableAudio() {
        try {
            await this.assetLoader.audioContext?.resume();
        } catch (error) {
            console.warn('Could not enable audio:', error);
        }
        this.showTitle();
    }

    // Keep the required silent black screen visible until audio is enabled.
    showAudioPrompt() {
        this.root.className = 'menu-screen menu-intro';
        this.root.innerHTML = '<button class="audio-prompt" data-action="enable-audio">Click to enable audio</button>';
    }

    // Render the game title, panoramic background, and credits overlay.
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

    // Fetch open server lobbies, placing creation above the available games.
    async showLobbies(message = '') {
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
            const createButton = document.createElement('button');
            createButton.dataset.action = 'create-lobby';
            createButton.className = 'lobby-entry create-lobby-entry';
            const createName = document.createElement('strong');
            createName.textContent = 'Create a lobby';
            const plus = document.createElement('span');
            plus.className = 'lobby-symbol';
            plus.textContent = '+';
            createButton.append(createName, plus);
            list.append(createButton);

            for (const lobby of this.lobbies) list.append(this.createLobbyEntry(lobby));
            this.root.querySelector('.menu-error').textContent = message;
        } catch (error) {
            this.root.querySelector('.menu-error').textContent = 'Could not load lobbies. Try again.';
            console.error('Could not load lobbies:', error);
        }
    }

    // Build one public or locked lobby entry from its safe server summary.
    createLobbyEntry(lobby) {
        const row = document.createElement('div');
        row.className = 'lobby-row';
        const button = document.createElement('button');
        button.dataset.action = 'join';
        button.dataset.lobbyId = lobby.id;
        button.className = 'lobby-entry';
        const name = document.createElement('strong');
        name.textContent = lobby.name;
        const details = document.createElement('span');
        details.className = 'lobby-details';
        if (lobby.status === 'private') {
            const lock = document.createElement('span');
            lock.className = 'lobby-lock';
            lock.setAttribute('aria-label', 'Private lobby');
            lock.textContent = '🔒';
            details.append(lock);
        }
        const count = document.createElement('span');
        count.textContent = `${lobby.players}/${lobby.maxPlayers} players`;
        details.append(count);
        button.append(name, details);
        row.append(button);
        if (String(lobby.hostId) === String(this.menuSocket.id)) {
            const actions = document.createElement('div');
            actions.className = 'lobby-actions';
            for (const [action, label] of [['edit-lobby', 'Edit'], ['delete-lobby', 'Delete']]) {
                const actionButton = document.createElement('button');
                actionButton.type = 'button';
                actionButton.dataset.action = action;
                actionButton.dataset.lobbyId = lobby.id;
                actionButton.textContent = label;
                actions.append(actionButton);
            }
            row.append(actions);
        }
        return row;
    }

    // Show the requested lobby settings with a socket-ID-based default name.
    showCreateLobby(lobby = null) {
        this.editingLobby = lobby;
        this.root.innerHTML = `
            <main class="lobby-content lobby-settings-content">
                <h1>${lobby ? 'Edit lobby' : 'Create a lobby'}</h1>
                <form data-action="${lobby ? 'edit-lobby' : 'create-lobby'}" class="lobby-settings">
                    <label>Lobby name
                        <input name="name" maxlength="64" required>
                    </label>
                    <label>Lobby status
                        <select name="status">
                            <option value="public">Public — anyone can join</option>
                            <option value="private">Private — password required</option>
                        </select>
                    </label>
                    <label class="lobby-password-field" hidden>Password
                        <input name="accessCode" type="text" maxlength="128" autocomplete="off" spellcheck="false">
                    </label>
                    <label>World size (chunks)
                        <input name="worldSizeChunks" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="Leave blank for infinite world">
                    </label>
                    <label>Maximum render distance (chunks)
                        <input name="maxRenderDistance" type="number" min="2" max="12" step="1" value="12" required>
                    </label>
                    <label>Maximum players
                        <input name="maxPlayers" type="number" min="1" max="64" step="1" value="16" required>
                    </label>
                    <p class="menu-error" role="status"></p>
                    <div class="form-actions">
                        <button type="button" data-action="cancel-create">Cancel</button>
                        <button type="submit">${lobby ? 'Save' : 'Create'}</button>
                    </div>
                </form>
            </main>`;
        const name = this.root.querySelector('[name="name"]');
        name.value = lobby?.name ?? this.getDefaultLobbyName();
        this.root.querySelector('[name="status"]').value = lobby?.status ?? 'public';
        this.root.querySelector('[name="worldSizeChunks"]').value = lobby?.worldSizeChunks ?? '';
        this.root.querySelector('[name="maxRenderDistance"]').value = lobby?.maxRenderDistance ?? 12;
        this.root.querySelector('[name="maxPlayers"]').value = lobby?.maxPlayers ?? 16;
        const accessCode = this.root.querySelector('[name="accessCode"]');
        if (lobby?.status === 'private') accessCode.placeholder = 'Leave blank to keep current access code';
        accessCode.required = false;
        this.root.querySelector('.lobby-password-field').hidden = (lobby?.status ?? 'public') !== 'private';
    }

    // Use the temporary menu connection ID as the current player name.
    getDefaultLobbyName() { return `${this.menuSocket.id || 'Player'}'s lobby`; }

    // Collect the password for server verification without exposing it in lobby data.
    showPasswordPrompt(lobby, message = '') {
        this.pendingPrivateLobby = lobby;
        const dialog = document.createElement('section');
        dialog.className = 'credits password-dialog';
        dialog.innerHTML = `
            <form data-action="private-password" class="credits-card">
                <h2>Join ${escapeText(lobby.name)}</h2>
                <label>Password<input name="accessCode" type="text" maxlength="128" autocomplete="off" spellcheck="false" required></label>
                <p class="menu-error" role="status">${escapeText(message)}</p>
                <div class="form-actions">
                    <button type="button" data-action="cancel-password">Cancel</button>
                    <button type="submit">Join</button>
                </div>
            </form>`;
        this.root.append(dialog);
        dialog.querySelector('[name="accessCode"]').focus();
    }

    // Create the lobby through the menu-only socket; the server keeps credentials private.
    async createLobby(form) {
        const values = new FormData(form);
        const settings = {
            name: values.get('name'),
            status: values.get('status'),
            password: values.get('accessCode'),
            worldSizeChunks: values.get('worldSizeChunks') === '' ? null : Number(values.get('worldSizeChunks')),
            maxRenderDistance: Number(values.get('maxRenderDistance')),
            maxPlayers: Number(values.get('maxPlayers')),
        };
        const submit = form.querySelector('[type="submit"]');
        submit.disabled = true;
        submit.textContent = 'Creating…';
        try {
            const result = await new Promise((resolve, reject) => {
                if (!this.menuSocket.connected) {
                    reject(new Error('The menu connection is unavailable. Try again.'));
                    return;
                }
                const action = form.dataset.action === 'edit-lobby' ? 'lobby:edit' : 'lobby:create';
                const payload = action === 'lobby:edit'
                    ? { lobbyId: this.editingLobby.id, settings }
                    : settings;
                this.menuSocket.timeout(10000).emit(action, payload, (error, response) => {
                    if (error) reject(new Error('The server did not respond. Try again.'));
                    else resolve(response);
                });
            });
            if (!result?.ok) throw new Error(result?.message || 'Could not create lobby.');
            await this.showLobbies(form.dataset.action === 'edit-lobby' ? 'Lobby settings saved.' : 'Lobby created. Select it to join.');
        } catch (error) {
            form.querySelector('.menu-error').textContent = error.message;
            submit.disabled = false;
            submit.textContent = form.dataset.action === 'edit-lobby' ? 'Save' : 'Create';
        }
    }

    // Ask the server to delete a lobby after verifying host ownership there.
    async deleteLobby(lobbyId) {
        const lobby = this.lobbies.find(candidate => String(candidate.id) === String(lobbyId));
        if (!lobby || !window.confirm(`Delete ${lobby.name}?`)) return;
        this.menuSocket.timeout(10000).emit('lobby:delete', { lobbyId }, async (error, result) => {
            if (error || !result?.ok) {
                await this.showLobbies(result?.message || 'Could not delete lobby. Try again.');
                return;
            }
            await this.showLobbies('Lobby deleted.');
        });
    }

    // Verify privately on the menu socket before allocating a game client.
    joinLobby(lobby, password) {
        if (this.joining) return;
        if (lobby.status === 'private') {
            this.joining = true;
            const dialog = this.root.querySelector('.password-dialog');
            const submit = dialog?.querySelector('[type="submit"]');
            if (submit) {
                submit.disabled = true;
                submit.textContent = 'Checking…';
            }
            this.menuSocket.timeout(10000).emit('lobby:verify-password', {
                lobbyId: lobby.id, password,
            }, (error, result) => {
                this.joining = false;
                if (error || !result?.valid) {
                    const message = error ? 'Could not verify lobby access. Try again.' : 'Incorrect password.';
                    if (dialog?.isConnected) {
                        dialog.querySelector('.menu-error').textContent = message;
                        submit.disabled = false;
                        submit.textContent = 'Join';
                    } else {
                        this.showPasswordPrompt(lobby, message);
                    }
                    return;
                }
                dialog?.remove();
                this.startJoin(lobby, password);
            });
            return;
        }
        this.startJoin(lobby, password);
    }

    // Start the selected world connection after the player has passed menu checks.
    startJoin(lobby, password) {
        if (this.joining) return;
        this.joining = true;
        this.onJoinLobby(lobby, password, {
            onJoined: () => {
                this.menuSocket.disconnect();
                this.root.classList.add('hidden');
            },
            onError: message => {
                this.joining = false;
                this.showLobbies(message);
            },
        });
    }
}

// Escape a lobby title before placing it into the private-password dialog template.
function escapeText(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
}
