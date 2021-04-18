/*** CONSTANTS ***/
var ELEMENT_NODE_TYPE = 1;
var TEXT_NODE_TYPE = 3;
var UNEXPANDABLE = /(script|style|svg|audio|canvas|figure|video|select|input|textarea)/i;
var HIGHLIGHT_TAG = 'highlight-tag';
var HIGHLIGHT_CLASS = 'highlighted';
var SELECTED_CLASS = 'selected';
var DEFAULT_MAX_RESULTS = 500;
var DEFAULT_HIGHLIGHT_COLOR = '#ffff00';
var DEFAULT_SELECTED_COLOR = '#ff9900';
var DEFAULT_TEXT_COLOR = '#000000';
var DEFAULT_CASE_INSENSITIVE = false;
var HIGH_BG_COLORS = [
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

/*** CONSTANTS ***/

/*** VARIABLES ***/
var searchInfo;
var matchKeys = {};
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
function highlight(regex, highlightColor, selectedColor, textColor, maxResults) {
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
                var isurl = /(%[\w\d]{2})+/i.test(matchedText);
                var addcnt = 1;
                if (isurl && matchedText.replace(/%[\w\d]{2}/ig, '').length == '') {
                    color = matchKeys[ltext] = ['inherit', 'inherit']
                    addcnt = 0;
                }
                var color = matchKeys[ltext] ? matchKeys[ltext] :
                    matchKeys[ltext] = HIGH_BG_COLORS[cnt++ % HIGH_BG_COLORS.length];
                matchedTextNode.splitText(matchedText.length);
                spanNode.className = HIGHLIGHT_CLASS;
                spanNode.style.backgroundColor = color[0]; // highlightColor;
                spanNode.style.color = color[1];
                spanNode.style.padding = '3px';
                spanNode.colors = color;
                spanNode.appendChild(matchedTextNode.cloneNode(true));
                if (isurl) {
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
    highlightRecursive(document.getElementsByTagName('body')[0]);
};

/* Remove all highlights from page */
function removeHighlight() {
    while (node = document.body.querySelector(HIGHLIGHT_TAG + '.' + HIGHLIGHT_CLASS)) {
        node.outerHTML = node.innerHTML;
    }
    while (node = document.body.querySelector(HIGHLIGHT_TAG + '.' + SELECTED_CLASS)) {
        node.outerHTML = node.innerHTML;
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
function search(regexString, configurationChanged) {
    var regex = validateRegex(regexString);
    if (regex && regexString != '' && (configurationChanged || regexString !== searchInfo.regexString)) { // new valid regex string
        removeHighlight();
        chrome.storage.local.get({
                'highlightColor': DEFAULT_HIGHLIGHT_COLOR,
                'selectedColor': DEFAULT_SELECTED_COLOR,
                'textColor': DEFAULT_TEXT_COLOR,
                'maxResults': DEFAULT_MAX_RESULTS,
                'caseInsensitive': DEFAULT_CASE_INSENSITIVE
            },
            function(result) {
                initSearchInfo(regexString);
                if (result.caseInsensitive) {
                    regex = new RegExp(regexString, 'i');
                }
                highlight(regex, result.highlightColor, result.selectedColor, result.textColor, result.maxResults);
                selectFirstNode(result.selectedColor);
                returnSearchInfo('search');
            }
        );
    } else if (regex && regexString != '' && regexString === searchInfo.regexString) { // elements are already highlighted
        chrome.storage.local.get({
                'highlightColor': DEFAULT_HIGHLIGHT_COLOR,
                'selectedColor': DEFAULT_SELECTED_COLOR
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
                'selectedColor': DEFAULT_SELECTED_COLOR
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
                'selectedColor': DEFAULT_SELECTED_COLOR
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
        search('(%[\\w\\d]{2})+', request.configurationChanged);
    }
});
/*** LISTENERS ***/


/*** INIT ***/
initSearchInfo();
/*** INIT ***/