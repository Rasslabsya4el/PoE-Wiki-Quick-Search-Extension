// PoE Wiki Search Extension - CORS-safe search with autosuggest and wiki toggle
document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('searchInput');
    const suggestionsList = document.getElementById('suggestions');
    
    let currentSuggestions = [];
    let selectedIndex = -1;
    let debounceTimer = null;
    
    // Persist selected wiki using chrome.storage with localStorage fallback
    const storage = {
        async get(key, fallback) {
            try {
                if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
                    return new Promise((resolve) =>
                        chrome.storage.local.get(key, (data) => resolve(data?.[key] ?? fallback))
                    );
                }
            } catch (_) {}
            try {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : fallback;
            } catch (_) {
                return fallback;
            }
        },
        async set(key, value) {
            try {
                if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
                    return chrome.storage.local.set({ [key]: value });
                }
            } catch (_) {}
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (_) {}
        }
    };
    
    // Default wiki domain (PoE1)
    let wikiBase = "https://www.poewiki.net";
    
    // Initialize and restore saved value
    (async () => {
        const saved = await storage.get("wikiBase", wikiBase);
        wikiBase = saved || wikiBase;
        
        // Defensive guard: ensure wikiBase is one of the allowed hosts
        if (!wikiBase.includes("poewiki") && !wikiBase.includes("poe2wiki")) {
            wikiBase = "https://www.poewiki.net";
        }
        
        updateToggleUI();
    })();
    
    function updateToggleUI() {
        const poe1 = document.getElementById("toggle-poe1");
        const poe2 = document.getElementById("toggle-poe2");
        
        // Defensive guards: check if elements exist
        if (!poe1 || !poe2) return;
        
        if (wikiBase.includes("poewiki")) {
            poe1.classList.add("active");
            poe2.classList.remove("active");
        } else {
            poe2.classList.add("active");
            poe1.classList.remove("active");
        }
    }
    
    // Toggle buttons logic: save selection and refresh suggestions for current input
    document.getElementById("toggle-poe1").addEventListener("click", async () => {
        wikiBase = "https://www.poewiki.net";
        await storage.set("wikiBase", wikiBase);
        updateToggleUI();

        // Immediately refresh suggestions for current input
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        clearSuggestions();
        const currentQuery = searchInput.value.trim();
        if (currentQuery) {
            fetchSuggestions(currentQuery);
        }
    });
    
    document.getElementById("toggle-poe2").addEventListener("click", async () => {
        wikiBase = "https://www.poe2wiki.net";
        await storage.set("wikiBase", wikiBase);
        updateToggleUI();

        // Immediately refresh suggestions for current input
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        clearSuggestions();
        const currentQuery = searchInput.value.trim();
        if (currentQuery) {
            fetchSuggestions(currentQuery);
        }
    });
    
    // Auto-focus the input field when popup opens
    searchInput.focus();
    
    // Input handler with 300ms debounce to limit API calls
    searchInput.addEventListener('input', function() {
        const query = searchInput.value.trim();
        
        // Clear previous debounce timer
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        
        // Hide suggestions if input is empty
        if (!query) {
            clearSuggestions();
            return;
        }
        
        // Debounce API calls (300ms delay)
        debounceTimer = setTimeout(() => {
            fetchSuggestions(query);
        }, 300);
    });
    
    // Handle keyboard navigation
    searchInput.addEventListener('keydown', function(event) {
        if (suggestionsList.classList.contains('open')) {
            switch (event.key) {
                case 'ArrowDown':
                    event.preventDefault();
                    navigateSuggestions(1);
                    break;
                case 'ArrowUp':
                    event.preventDefault();
                    navigateSuggestions(-1);
                    break;
                case 'Enter':
                    event.preventDefault();
                    if (selectedIndex >= 0) {
                        const items = suggestionsList.querySelectorAll('li');
                        if (items[selectedIndex]) {
                            const link = items[selectedIndex].querySelector('a');
                            if (link) {
                                // Open in active tab and close popup
                                chrome.tabs.create({ url: link.href, active: true });
                                window.close();
                            }
                        }
                    } else {
                        // No suggestion selected, perform exact page check
                        performExactPageCheck(searchInput.value.trim());
                    }
                    break;
                case 'Escape':
                    hideSuggestions();
                    break;
            }
        } else if (event.key === 'Enter') {
            // No suggestions visible, perform exact page check
            performExactPageCheck(searchInput.value.trim());
        }
    });
    
    // Handle clicking outside to close suggestions
    document.addEventListener('click', function(event) {
        if (!searchInput.contains(event.target) && !suggestionsList.contains(event.target)) {
            hideSuggestions();
        }
    });
    
    // Event delegation for suggestion links - handle all mouse interactions
    suggestionsList.addEventListener('mousedown', function(event) {
        const link = event.target.closest('a');
        if (!link) return;
        
        // Prevent default navigation for middle-click and Ctrl+Click only
        if (event.button === 1 || event.ctrlKey || event.metaKey) {
            event.preventDefault();
        }
        // Allow regular left-click to proceed (will be handled by click event)
    });
    
    suggestionsList.addEventListener('auxclick', function(event) {
        const link = event.target.closest('a');
        if (!link || event.button !== 1) return;
        
        event.preventDefault();
        event.stopPropagation();
        
        // Open in background tab and keep popup open
        chrome.tabs.create({ url: link.href, active: false });
        
        // Keep input focused
        setTimeout(() => searchInput.focus(), 0);
    });
    
    suggestionsList.addEventListener('click', function(event) {
        const link = event.target.closest('a');
        if (!link) return;
        
        // Handle Ctrl+Click (background tab, keep popup open)
        if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            event.stopPropagation();
            
            // Open in background tab and keep popup open
            chrome.tabs.create({ url: link.href, active: false });
            
            // Keep input focused
            setTimeout(() => searchInput.focus(), 0);
        }
        // Handle regular left-click (active tab, close popup)
        else if (event.button === 0) {
            event.preventDefault();
            event.stopPropagation();
            
            // Open in active tab and close popup
            chrome.tabs.create({ url: link.href, active: true });
            window.close();
        }
    });
    
    // Fetch suggestions from MediaWiki OpenSearch API
    async function fetchSuggestions(query) {
        try {
            const apiUrl = `${wikiBase}/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=10&namespace=0&format=json&origin=*`;
            
            const response = await fetch(apiUrl);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            // Parse API response into suggestion objects
            if (data && data.length >= 4) {
                const suggestions = data[1]; // Array of suggestion titles
                const urls = data[3]; // Array of corresponding URLs
                
                currentSuggestions = suggestions.map((title, index) => ({
                    title: title,
                    url: urls[index] || `${wikiBase}/wiki/${encodeURIComponent(title)}`
                }));
                
                displaySuggestions(); // render and open dropdown
            } else {
                clearSuggestions();
            }
        } catch (error) {
            console.error('Failed to fetch suggestions:', error);
            clearSuggestions();
        }
    }
    
    // Clear suggestions: close dropdown and reset highlight index
    function clearSuggestions() {
        // Remove all children without leaving whitespace text nodes
        suggestionsList.replaceChildren();
        suggestionsList.classList.remove('open');
        selectedIndex = -1;
    }
    
    // Display suggestions: rebuild list and open dropdown when non-empty
    function displaySuggestions() {
        clearSuggestions();
        if (!currentSuggestions || currentSuggestions.length === 0) return; // keep closed
        
        // Add API suggestions
        currentSuggestions.forEach((suggestion, index) => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = suggestion.url;
            a.textContent = suggestion.title;
            li.appendChild(a);
            suggestionsList.appendChild(li);
        });
        
        // Always add "Search for..." item at the bottom
        const searchLi = document.createElement('li');
        searchLi.className = 'search-item';
        const searchA = document.createElement('a');
        const searchUrl = `${wikiBase}/index.php?search=${encodeURIComponent(searchInput.value.trim())}&title=Special%3ASearch&go=Go`;
        searchA.href = searchUrl;
        searchA.textContent = `Search for pages containing "${searchInput.value.trim()}"`;
        searchLi.appendChild(searchA);
        suggestionsList.appendChild(searchLi);
        
        // Show only when non-empty
        suggestionsList.classList.add('open');
    }
    
    // Navigate suggestions with arrow keys
    function navigateSuggestions(direction) {
        const items = suggestionsList.querySelectorAll('li');
        if (items.length === 0) return;
        
        // Remove previous highlight
        if (selectedIndex >= 0 && items[selectedIndex]) {
            items[selectedIndex].classList.remove('highlighted');
        }
        
        // Update selected index
        selectedIndex += direction;
        
        // Wrap around
        if (selectedIndex < 0) {
            selectedIndex = items.length - 1;
        } else if (selectedIndex >= items.length) {
            selectedIndex = 0;
        }
        
        // Highlight current item
        if (selectedIndex >= 0 && items[selectedIndex]) {
            items[selectedIndex].classList.add('highlighted');
            items[selectedIndex].scrollIntoView({ block: 'nearest' });
        }
    }
    
    // Hide suggestions dropdown
    function hideSuggestions() {
        clearSuggestions();
    }
    
    // Perform exact page check using MediaWiki Query API (CORS-safe)
    async function performExactPageCheck(searchTerm) {
        if (!searchTerm) return;
        
        hideSuggestions();
        
        try {
            // Normalize input: trim and collapse spaces, but don't force underscores/casing
            const normalizedQuery = searchTerm.trim().replace(/\s+/g, ' ');
            
            const apiUrl = `${wikiBase}/api.php?action=query&titles=${encodeURIComponent(normalizedQuery)}&redirects=1&prop=info&inprop=url&format=json&origin=*`;
            
            const response = await fetch(apiUrl);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            // Check if we have a valid page
            if (data.query && data.query.pages) {
                const pages = Object.values(data.query.pages);
                
                // Look for a page that exists (not missing/invalid)
                const validPage = pages.find(page => 
                    page.pageid && 
                    !page.missing && 
                    !page.invalid && 
                    page.fullurl
                );
                
                if (validPage) {
                    // Page exists, open it directly
                    chrome.tabs.create({ url: validPage.fullurl });
                    return;
                }
            }
            
            // No valid page found, use fallback search
            const fallbackUrl = `${wikiBase}/index.php?search=${encodeURIComponent(searchTerm)}&title=Special%3ASearch&profile=default&fulltext=1`;
            chrome.tabs.create({ url: fallbackUrl });
            
        } catch (error) {
            console.error('Exact page check failed:', error);
            // Fallback to search page on any error
            const fallbackUrl = `${wikiBase}/index.php?search=${encodeURIComponent(searchTerm)}&title=Special%3ASearch&profile=default&fulltext=1`;
            chrome.tabs.create({ url: fallbackUrl });
        }
    }
});