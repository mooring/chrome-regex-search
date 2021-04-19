/*** CONSTANTS ***/
const ELEMENT_NODE_TYPE = 1;
const TEXT_NODE_TYPE  = 3;
const UNEXPANDABLE = /(script|style|svg|audio|canvas|figure|video|select|input|textarea)/i;
const HIGHLIGHT_TAG = 'highlight-tag';
const HIGHLIGHT_CLASS = 'highlighted';
const SELECTED_CLASS = 'selected';
const DEFAULT_MAX_RESULTS = 500;
const DEFAULT_HIGHLIGHT_COLOR = '#ffff00';
const DEFAULT_SELECTED_COLOR = '#ff9900';
const DEFAULT_TEXT_COLOR = '#000000';
const DEFAULT_CASE_INSENSITIVE = false;
const DEFAULT_UNESCAPE_URL = false;
const HIGH_BG_COLORS = [
    ['#f23321', '#ffffff'],
    ['#f3b27a', '#ffffff'],
    ['#5d7430', '#ffffff'],
    ['#742c1e', '#ffffff'],
    ['#da5fa2', '#ffffff'],
    ['#cac197', '#ffffff'],
    ['#52422a', '#ffffff'],
    ['#34514d', '#ffffff'],
    ['#a51709', '#ffffff'],
    ['#7b99bf', '#ffffff'],
    ['#024a59', '#ffffff'],
    ['#a67799', '#ffffff'],
    ['#0e8c8b', '#ffffff'],
    ['#d98f4e', '#ffffff'],
    ['#381720', '#ffffff'],
    ['#2f2c37', '#ffffff'],
    ['#18283f', '#ffffff'],
    ['#3c4e72', '#ffffff'],
    ['#1f0f02', '#ffffff'],
];
const URL_REGEX = /(%[A-F0-9]{2})/ig;
const CONFIG = { attributes: false, childList: true, subtree: true }
/*** CONSTANTS ***/

/*** VARIABLES ***/
let searchInfo;
let matchKeys = {};
let observer = new MutationObserver(watchBodyChange);
/*** VARIABLES ***/

/*** LIBRARY FUNCTIONS ***/
Element.prototype.documentOffsetTop = function() {
    return this.offsetTop + (this.offsetParent ? this.offsetParent.documentOffsetTop() : 0);
};
Element.prototype.visible = function() {
    return (!window.getComputedStyle(this) || window.getComputedStyle(this).getPropertyValue('display') == '' ||
        window.getComputedStyle(this).getPropertyValue('display') != 'none')
}
/*** LIBRARY FUNCTIONS ***/

/*** FUNCTIONS ***/
/* Initialize search information for this tab */
function initSearchInfo(pattern) {
    var pattern = typeof pattern !== 'undefined' ? pattern : '';
    searchInfo = {
        regexString: pattern,
        selectedIndex: 0,
        highlightedNodes: [],
        length: 0
    }
    chrome.storage.local.get({
            'maxResults': DEFAULT_MAX_RESULTS,
            'unescapeURL': DEFAULT_UNESCAPE_URL
        },
        function(result) {
            searchInfo.maxResults = result.maxResults;
            searchInfo.unescapeURL = result.unescapeURL;
            observer.observe(document.body, CONFIG);
        }
    );
}
/*** FUNCTIONS ***/
/* add body dom change observe */
function watchBodyChange(mutationsList, observer){
    if(!searchInfo || !searchInfo.regexString || searchInfo.searching){
        return;
    }
    for(const mutation of mutationsList) {
        if (mutation.type === 'childList') {
            if(mutation.addedNodes && mutation.addedNodes.length > 0){
                for(var i=0,il=mutation.addedNodes.length; i<il; i++){
                    let node = mutation.addedNodes[i];
                    if(
                        !node.touched 
                        && node.innerHTML && node.innerHTML.length > 0 
                        && node.nodeName.toLowerCase() != HIGHLIGHT_TAG
                        && !node.innerHTML.includes(HIGHLIGHT_TAG)
                    ){
                        var regex = validateRegex(searchInfo.regexString);
                        if(regex){
                            node.touched = true;
                            highlight(regex, searchInfo.maxResults, node);
                            if(searchInfo.unescapeURL){
                                highlight(URL_REGEX, searchInfo.maxResults, node)
                            }
                        }
                    }
                }
            }
            
        }else{
            console.log('not childList', mutation)
        }
    }
}

/* Send message with search information for this tab */
function returnSearchInfo(cause) {
    chrome.runtime.sendMessage({
        'message': 'returnSearchInfo',
        'regexString': searchInfo.regexString,
        'currentSelection': searchInfo.selectedIndex,
        'numResults': searchInfo.length,
        'cause': cause
    });
}

/* Check if the given node is a text node */
function isTextNode(node) {
    return node && node.nodeType === TEXT_NODE_TYPE;
}

/* Check if the given node is an expandable node that will yield text nodes */
function isExpandable(node) {
    return node && node.nodeType === ELEMENT_NODE_TYPE && node.childNodes &&
        !UNEXPANDABLE.test(node.tagName) && node.visible();
}

/* Highlight all text that matches regex */
function highlight(regex, maxResults, highlightNode) {
    let cnt = 0;
    function highlightRecursive(node) {
        if (searchInfo.length >= maxResults) {
            return;
        }
        if (isTextNode(node)) {
            var index = node.data.search(regex);
            if (index >= 0 && node.data.length > 0) {
                var matchedText = node.data.match(regex)[0];
                var matchedTextNode = node.splitText(index);
                var spanNode = document.createElement(HIGHLIGHT_TAG);
                var ltext = matchedText.toLowerCase();
                var isurl = URL_REGEX.test(matchedText);
                var addcnt = 1;
                if (isurl && matchedText.replace(URL_REGEX, '').length == '') {
                    color = matchKeys[ltext] = ['inherit', 'inherit']
                }
                var color = matchKeys[ltext] ? matchKeys[ltext] :
                    matchKeys[ltext] = HIGH_BG_COLORS[cnt++ % HIGH_BG_COLORS.length];
                matchedTextNode.splitText(matchedText.length);
                spanNode.className = HIGHLIGHT_CLASS;
                spanNode.style.backgroundColor = color[0]; // highlightColor;
                spanNode.style.color = color[1];
                if(!isurl){spanNode.style.padding = '3px';}
                spanNode.colors = color;
                spanNode.appendChild(matchedTextNode.cloneNode(true));
                if (isurl) {
                    addcnt = 0;
                    try {
                        spanNode.textContent = decodeURIComponent(spanNode.textContent)
                    } catch (e) {
                        console.error(e)
                    }
                }
                matchedTextNode.parentNode.replaceChild(spanNode, matchedTextNode);
                searchInfo.highlightedNodes.push(spanNode);
                searchInfo.length += addcnt;
                return addcnt;
            }
        } else if (isExpandable(node)) {
            var children = node.childNodes;
            for (var i = 0; i < children.length; ++i) {
                var child = children[i];
                i += highlightRecursive(child);
            }
        }
        return 0;
    }
    highlightRecursive(highlightNode || document.getElementsByTagName('body')[0]);
};

/* Remove all highlights from page */
function removeHighlight() {
    while (node = document.body.querySelector(HIGHLIGHT_TAG + '.' + HIGHLIGHT_CLASS)) {
        node.replaceWith(node.firstChild);
    }
    while (node = document.body.querySelector(HIGHLIGHT_TAG + '.' + SELECTED_CLASS)) {
        node.replaceWith(node.firstChild);
    }
};

/* Scroll page to given element */
function scrollToElement(element) {
    element.scrollIntoView();
    var top = element.documentOffsetTop() - (window.innerHeight / 2);
    window.scrollTo(0, Math.max(top, window.pageYOffset - (window.innerHeight / 2)));
}

/* Select first regex match on page */
function selectFirstNode(selectedColor) {
    var length = searchInfo.length;
    if (length > 0) {
        searchInfo.highlightedNodes[0].className = SELECTED_CLASS;
        searchInfo.highlightedNodes[0].style.backgroundColor = selectedColor;
        parentNode = searchInfo.highlightedNodes[0].parentNode;
        scrollToElement(searchInfo.highlightedNodes[0]);
    }
}

/* Helper for selecting a regex matched element */
function selectNode(highlightedColor, selectedColor, getNext) {
    var length = searchInfo.length;
    if (length > 0) {
        var spanNode = searchInfo.highlightedNodes[searchInfo.selectedIndex];
        spanNode.className = HIGHLIGHT_CLASS;
        spanNode.style.backgroundColor = spanNode.colors[0];
        if (getNext) {
            if (searchInfo.selectedIndex === length - 1) {
                searchInfo.selectedIndex = 0;
            } else {
                searchInfo.selectedIndex += 1;
            }
        } else {
            if (searchInfo.selectedIndex === 0) {
                searchInfo.selectedIndex = length - 1;
            } else {
                searchInfo.selectedIndex -= 1;
            }
        }
        spanNode = searchInfo.highlightedNodes[searchInfo.selectedIndex];
        spanNode.className = SELECTED_CLASS;
        spanNode.style.textShadow = 'yellow 1px 1px 1px';
        parentNode = searchInfo.highlightedNodes[searchInfo.selectedIndex].parentNode;
        returnSearchInfo('selectNode');
        scrollToElement(searchInfo.highlightedNodes[searchInfo.selectedIndex]);
    }
}
/* Forward cycle through regex matched elements */
function selectNextNode(highlightedColor, selectedColor) {
    selectNode(highlightedColor, selectedColor, true);
}

/* Backward cycle through regex matched elements */
function selectPrevNode(highlightedColor, selectedColor) {
    selectNode(highlightedColor, selectedColor, false);
}

/* Validate that a given pattern string is a valid regex */
function validateRegex(pattern) {
    try {
        var regex = new RegExp(pattern);
        return regex;
    } catch (e) {
        return false;
    }
}

/* Find and highlight regex matches in web page from a given regex string or pattern */
function search(regexString, configurationChanged, highlightNode, keepHighlight) {
    var regex = validateRegex(regexString);
    if (regex && regexString != '' && (configurationChanged || regexString !== searchInfo.regexString)) { // new valid regex string
        if(!keepHighlight){removeHighlight();}
        chrome.storage.local.get({
                'highlightColor': DEFAULT_HIGHLIGHT_COLOR,
                'selectedColor': DEFAULT_SELECTED_COLOR,
                'textColor': DEFAULT_TEXT_COLOR,
                'maxResults': DEFAULT_MAX_RESULTS,
                'caseInsensitive': DEFAULT_CASE_INSENSITIVE,
                'unescapeURL': DEFAULT_UNESCAPE_URL
            },
            function(result) {
                initSearchInfo(regexString);
                if (result.caseInsensitive) {
                    regex = new RegExp(regexString, 'i');
                }
                searchInfo.searching = true;
                highlight(regex, result.maxResults, highlightNode);
                if(searchInfo.unescapeURL){
                    highlight(URL_REGEX, result.maxResults, highlightNode);
                }
                searchInfo.searching = false;
                selectFirstNode(result.selectedColor);
                returnSearchInfo('search');
            }
        );
    } else if (regex && regexString != '' && regexString === searchInfo.regexString) { // elements are already highlighted
        chrome.storage.local.get({
                'highlightColor': DEFAULT_HIGHLIGHT_COLOR,
                'selectedColor': DEFAULT_SELECTED_COLOR,
                'unescapeURL': DEFAULT_UNESCAPE_URL
            },
            function(result) {
                selectNextNode(result.highlightColor, result.selectedColor);
            }
        );
    } else { // blank string or invalid regex
        removeHighlight();
        initSearchInfo(regexString);
        returnSearchInfo('search');
    }
}
/*** FUNCTIONS ***/

/*** LISTENERS ***/
/* Received search message, find regex matches */
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if ('search' == request.message) {
        search(request.regexString, request.configurationChanged);
    }
    /* Received selectNextNode message, select next regex match */
    else if ('selectNextNode' == request.message) {
        chrome.storage.local.get({
                'highlightColor': DEFAULT_HIGHLIGHT_COLOR,
                'selectedColor': DEFAULT_SELECTED_COLOR,
                'unescapeURL': DEFAULT_UNESCAPE_URL
            },
            function(result) {
                selectNextNode(result.highlightColor, result.selectedColor);
            }
        );
    }
    /* Received selectPrevNode message, select previous regex match */
    else if ('selectPrevNode' == request.message) {
        chrome.storage.local.get({
                'highlightColor': DEFAULT_HIGHLIGHT_COLOR,
                'selectedColor': DEFAULT_SELECTED_COLOR,
                'unescapeURL': DEFAULT_UNESCAPE_URL
            },
            function(result) {
                selectPrevNode(result.highlightColor, result.selectedColor);
            }
        );
    } else if ('copyToClipboard' == request.message) {
        var clipboardHelper = document.createElement('textarea');
        try {
            var text = searchInfo.highlightedNodes.map(function(n) {
                return n.innerText;
            }).join('\n');
            clipboardHelper.appendChild(document.createTextNode(text));
            document.body.appendChild(clipboardHelper);
            clipboardHelper.select();
            document.execCommand('copy');
        } finally {
            document.body.removeChild(clipboardHelper);
        }
    }
    /* Received getSearchInfo message, return search information for this tab */
    else if ('getSearchInfo' == request.message) {
        sendResponse({
            message: "!"
        });
        returnSearchInfo('getSearchInfo');
    }else if('unescape' == request.message){
        search('(%[\\w\\d]{2})+', true, false, true);
    }
});
/*** LISTENERS ***/


/*** INIT ***/
initSearchInfo();
/*** INIT ***/