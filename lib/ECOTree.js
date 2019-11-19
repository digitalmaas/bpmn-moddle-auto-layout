/*-------------------------------------------------------------------------------------------
|     ECOTree.js
|--------------------------------------------------------------------------------------------
| (c) 2006 Emilio Cortegoso Lobato
|     
|     ECOTree is a javascript component for tree drawing. It implements the node positioning
|     algorithm of John Q. Walker II "Positioning nodes for General Trees".
|    
|     Basic features include:
|       - Layout features: Different node sizes, colors, link types, alignments, separations
|                          root node positions, etc...
|       - Nodes can include a title and an hyperlink, and a hidden metadata.
|       - Subtrees can be collapsed and expanded at will.
|       - Single and Multiple selection modes.
|       - Search nodes using title and metadata as well.     
|     
|     This code is free source, but you will be kind if you don't distribute modified versions
|     with the same name, to avoid version collisions. Otherwise, please hack it!
|
|     References:
|                                                                
|     Walker II, J. Q., "A Node-Positioning Algorithm for General Trees"
|	     			   Software � Practice and Experience 10, 1980 553-561.    
|                      (Obtained from C++ User's journal. Feb. 1991)                                                                              
|					   
|     Last updated: October 26th, 2006
|     Version: 1.0
\------------------------------------------------------------------------------------------*/

ECONode = function (id, pid, dsc, w, h, c, bc, target, meta) {
	this.id = id;
	this.pid = pid;
	this.dsc = dsc;
	this.w = w;
	this.h = h;
	this.c = c;
	this.bc = bc;
	this.target = target;
	this.meta = meta;

	this.siblingIndex = 0;
	this.dbIndex = 0;

	this.XPosition = 0;
	this.YPosition = 0;
	this.prelim = 0;
	this.modifier = 0;
	this.leftNeighbor = null;
	this.rightNeighbor = null;
	this.nodeParent = null;
	this.nodeChildren = [];

	this.isCollapsed = false;
	this.canCollapse = false;

	this.isSelected = false;
}

ECONode.prototype._getLevel = function () {
	if (this.nodeParent.id == -1) { return 0; }
	else return this.nodeParent._getLevel() + 1;
}

ECONode.prototype._isAncestorCollapsed = function () {
	if (this.nodeParent.isCollapsed) { return true; }
	else {
		if (this.nodeParent.id == -1) { return false; }
		else { return this.nodeParent._isAncestorCollapsed(); }
	}
}

ECONode.prototype._setAncestorsExpanded = function () {
	if (this.nodeParent.id == -1) { return; }
	else {
		this.nodeParent.isCollapsed = false;
		return this.nodeParent._setAncestorsExpanded();
	}
}

ECONode.prototype._getChildrenCount = function () {
	if (this.isCollapsed) return 0;
	if (this.nodeChildren == null)
		return 0;
	else
		return this.nodeChildren.length;
}

ECONode.prototype._getLeftSibling = function () {
	if (this.leftNeighbor != null && this.leftNeighbor.nodeParent == this.nodeParent)
		return this.leftNeighbor;
	else
		return null;
}

ECONode.prototype._getRightSibling = function () {
	if (this.rightNeighbor != null && this.rightNeighbor.nodeParent == this.nodeParent)
		return this.rightNeighbor;
	else
		return null;
}

ECONode.prototype._getChildAt = function (i) {
	return this.nodeChildren[i];
}

ECONode.prototype._getChildrenCenter = function (tree) {
	node = this._getFirstChild();
	node1 = this._getLastChild();
	return node.prelim + ((node1.prelim - node.prelim) + tree._getNodeSize(node1)) / 2;
}

ECONode.prototype._getFirstChild = function () {
	return this._getChildAt(0);
}

ECONode.prototype._getLastChild = function () {
	return this._getChildAt(this._getChildrenCount() - 1);
}

ECOTree = function (obj) {
	this.config = {
		iMaxDepth: 100,
		iLevelSeparation: 40,
		iSiblingSeparation: 40,
		iSubtreeSeparation: 80,
		iRootOrientation: ECOTree.RO_LEFT,
		iNodeJustification: ECOTree.NJ_CENTER,
		topXAdjustment: 0,
		topYAdjustment: 0,
		render: "AUTO",
		linkType: "M",
		linkColor: "blue",
		nodeColor: "#CCCCFF",
		nodeFill: ECOTree.NF_GRADIENT,
		nodeBorderColor: "blue",
		nodeSelColor: "#FFFFCC",
		levelColors: ["#5555FF", "#8888FF", "#AAAAFF", "#CCCCFF"],
		levelBorderColors: ["#5555FF", "#8888FF", "#AAAAFF", "#CCCCFF"],
		colorStyle: ECOTree.CS_NODE,
		useTarget: true,
		searchMode: ECOTree.SM_DSC,
		selectMode: ECOTree.SL_MULTIPLE,
		defaultNodeWidth: 80,
		defaultNodeHeight: 40,
		defaultTarget: 'javascript:void(0);',
		expandedImage: './img/less.gif',
		collapsedImage: './img/plus.gif',
		transImage: './img/trans.gif'
	}

	this.version = "1.1";
	this.obj = obj;
	this.self = this;
	this.ctx = null;
	this.canvasoffsetTop = 0;
	this.canvasoffsetLeft = 0;

	this.maxLevelHeight = [];
	this.maxLevelWidth = [];
	this.previousLevelNode = [];

	this.rootYOffset = 0;
	this.rootXOffset = 0;

	this.nDatabaseNodes = [];
	this.mapIDs = {};

	this.root = new ECONode(-1, null, null, 2, 2);
	this.iSelectedNode = -1;
	this.iLastSearch = 0;

}

//Constant values

//Tree orientation
ECOTree.RO_TOP = 0;
ECOTree.RO_BOTTOM = 1;
ECOTree.RO_RIGHT = 2;
ECOTree.RO_LEFT = 3;

//Level node alignment
ECOTree.NJ_TOP = 0;
ECOTree.NJ_CENTER = 1;
ECOTree.NJ_BOTTOM = 2;

//Node fill type
ECOTree.NF_GRADIENT = 0;
ECOTree.NF_FLAT = 1;

//Colorizing style
ECOTree.CS_NODE = 0;
ECOTree.CS_LEVEL = 1;

//Search method: Title, metadata or both
ECOTree.SM_DSC = 0;
ECOTree.SM_META = 1;
ECOTree.SM_BOTH = 2;

//Selection mode: single, multiple, no selection
ECOTree.SL_MULTIPLE = 0;
ECOTree.SL_SINGLE = 1;
ECOTree.SL_NONE = 2;

//Layout algorithm
ECOTree._firstWalk = function (tree, node, level) {
	var leftSibling = null;

	node.XPosition = 0;
	node.YPosition = 0;
	node.prelim = 0;
	node.modifier = 0;
	node.leftNeighbor = null;
	node.rightNeighbor = null;
	tree._setLevelHeight(node, level);
	tree._setLevelWidth(node, level);
	tree._setNeighbors(node, level);
	if (node._getChildrenCount() == 0 || level == tree.config.iMaxDepth) {
		leftSibling = node._getLeftSibling();
		if (leftSibling != null)
			node.prelim = leftSibling.prelim + tree._getNodeSize(leftSibling) + tree.config.iSiblingSeparation;
		else
			node.prelim = 0;
	}
	else {
		var n = node._getChildrenCount();
		for (var i = 0; i < n; i++) {
			var iChild = node._getChildAt(i);
			ECOTree._firstWalk(tree, iChild, level + 1);
		}

		var midPoint = node._getChildrenCenter(tree);
		midPoint -= tree._getNodeSize(node) / 2;
		leftSibling = node._getLeftSibling();
		if (leftSibling != null) {
			node.prelim = leftSibling.prelim + tree._getNodeSize(leftSibling) + tree.config.iSiblingSeparation;
			node.modifier = node.prelim - midPoint;
			ECOTree._apportion(tree, node, level);
		}
		else {
			node.prelim = midPoint;
		}
	}
}

ECOTree._apportion = function (tree, node, level) {
	var firstChild = node._getFirstChild();
	var firstChildLeftNeighbor = firstChild.leftNeighbor;
	var j = 1;
	for (var k = tree.config.iMaxDepth - level; firstChild != null && firstChildLeftNeighbor != null && j <= k;) {
		var modifierSumRight = 0;
		var modifierSumLeft = 0;
		var rightAncestor = firstChild;
		var leftAncestor = firstChildLeftNeighbor;
		for (var l = 0; l < j; l++) {
			rightAncestor = rightAncestor.nodeParent;
			leftAncestor = leftAncestor.nodeParent;
			modifierSumRight += rightAncestor.modifier;
			modifierSumLeft += leftAncestor.modifier;
		}

		var totalGap = (firstChildLeftNeighbor.prelim + modifierSumLeft + tree._getNodeSize(firstChildLeftNeighbor) + tree.config.iSubtreeSeparation) - (firstChild.prelim + modifierSumRight);
		if (totalGap > 0) {
			var subtreeAux = node;
			var numSubtrees = 0;
			for (; subtreeAux != null && subtreeAux != leftAncestor; subtreeAux = subtreeAux._getLeftSibling())
				numSubtrees++;

			if (subtreeAux != null) {
				var subtreeMoveAux = node;
				var singleGap = totalGap / numSubtrees;
				for (; subtreeMoveAux != leftAncestor; subtreeMoveAux = subtreeMoveAux._getLeftSibling()) {
					subtreeMoveAux.prelim += totalGap;
					subtreeMoveAux.modifier += totalGap;
					totalGap -= singleGap;
				}

			}
		}
		j++;
		if (firstChild._getChildrenCount() == 0)
			firstChild = tree._getLeftmost(node, 0, j);
		else
			firstChild = firstChild._getFirstChild();
		if (firstChild != null)
			firstChildLeftNeighbor = firstChild.leftNeighbor;
	}
}

ECOTree._secondWalk = function (tree, node, level, X, Y) {
	if (level <= tree.config.iMaxDepth) {
		var xTmp = tree.rootXOffset + node.prelim + X;
		var yTmp = tree.rootYOffset + Y;
		var maxsizeTmp = 0;
		var nodesizeTmp = 0;
		var flag = false;

		switch (tree.config.iRootOrientation) {
			case ECOTree.RO_TOP:
			case ECOTree.RO_BOTTOM:
				maxsizeTmp = tree.maxLevelHeight[level];
				nodesizeTmp = node.h;
				break;

			case ECOTree.RO_RIGHT:
			case ECOTree.RO_LEFT:
				maxsizeTmp = tree.maxLevelWidth[level];
				flag = true;
				nodesizeTmp = node.w;
				break;
		}
		switch (tree.config.iNodeJustification) {
			case ECOTree.NJ_TOP:
				node.XPosition = xTmp;
				node.YPosition = yTmp;
				break;

			case ECOTree.NJ_CENTER:
				node.XPosition = xTmp;
				node.YPosition = yTmp + (maxsizeTmp - nodesizeTmp) / 2;
				break;

			case ECOTree.NJ_BOTTOM:
				node.XPosition = xTmp;
				node.YPosition = (yTmp + maxsizeTmp) - nodesizeTmp;
				break;
		}
		if (flag) {
			var swapTmp = node.XPosition;
			node.XPosition = node.YPosition;
			node.YPosition = swapTmp;
		}
		switch (tree.config.iRootOrientation) {
			case ECOTree.RO_BOTTOM:
				node.YPosition = -node.YPosition - nodesizeTmp;
				break;

			case ECOTree.RO_RIGHT:
				node.XPosition = -node.XPosition - nodesizeTmp;
				break;
		}
		if (node._getChildrenCount() != 0)
			ECOTree._secondWalk(tree, node._getFirstChild(), level + 1, X + node.modifier, Y + maxsizeTmp + tree.config.iLevelSeparation);
		var rightSibling = node._getRightSibling();
		if (rightSibling != null)
			ECOTree._secondWalk(tree, rightSibling, level, X, Y);
	}
}

ECOTree.prototype._positionTree = function () {
	this.maxLevelHeight = [];
	this.maxLevelWidth = [];
	this.previousLevelNode = [];
	ECOTree._firstWalk(this.self, this.root, 0);

	switch (this.config.iRootOrientation) {
		case ECOTree.RO_TOP:
		case ECOTree.RO_LEFT:
			this.rootXOffset = this.config.topXAdjustment + this.root.XPosition;
			this.rootYOffset = this.config.topYAdjustment + this.root.YPosition;
			break;

		case ECOTree.RO_BOTTOM:
		case ECOTree.RO_RIGHT:
			this.rootXOffset = this.config.topXAdjustment + this.root.XPosition;
			this.rootYOffset = this.config.topYAdjustment + this.root.YPosition;
	}

	ECOTree._secondWalk(this.self, this.root, 0, 0, 0);
}

ECOTree.prototype._setLevelHeight = function (node, level) {
	if (this.maxLevelHeight[level] == null)
		this.maxLevelHeight[level] = 0;
	if (this.maxLevelHeight[level] < node.h)
		this.maxLevelHeight[level] = node.h;
}

ECOTree.prototype._setLevelWidth = function (node, level) {
	if (this.maxLevelWidth[level] == null)
		this.maxLevelWidth[level] = 0;
	if (this.maxLevelWidth[level] < node.w)
		this.maxLevelWidth[level] = node.w;
}

ECOTree.prototype._setNeighbors = function (node, level) {
	node.leftNeighbor = this.previousLevelNode[level];
	if (node.leftNeighbor != null)
		node.leftNeighbor.rightNeighbor = node;
	this.previousLevelNode[level] = node;
}

ECOTree.prototype._getNodeSize = function (node) {
	switch (this.config.iRootOrientation) {
		case ECOTree.RO_TOP:
		case ECOTree.RO_BOTTOM:
			return node.w;

		case ECOTree.RO_RIGHT:
		case ECOTree.RO_LEFT:
			return node.h;
	}
	return 0;
}

ECOTree.prototype._getLeftmost = function (node, level, maxlevel) {
	if (level >= maxlevel) return node;
	if (node._getChildrenCount() == 0) return null;

	var n = node._getChildrenCount();
	for (var i = 0; i < n; i++) {
		var iChild = node._getChildAt(i);
		var leftmostDescendant = this._getLeftmost(iChild, level + 1, maxlevel);
		if (leftmostDescendant != null)
			return leftmostDescendant;
	}

	return null;
}


ECOTree.prototype.UpdateTree = function () {
	this._positionTree();
}

ECOTree.prototype.add = function (id, pid, dsc, w, h, c, bc, target, meta) {
	var nw = w || this.config.defaultNodeWidth; //Width, height, colors, target and metadata defaults...
	var nh = h || this.config.defaultNodeHeight;
	var color = c || this.config.nodeColor;
	var border = bc || this.config.nodeBorderColor;
	var tg = (this.config.useTarget) ? ((typeof target == "undefined") ? (this.config.defaultTarget) : target) : null;
	var metadata = (typeof meta != "undefined") ? meta : "";

	var pnode = null; //Search for parent node in database
	if (pid === -1) {
		pnode = this.root;
	}
	else {
		for (var k = 0; k < this.nDatabaseNodes.length; k++) {
			if (this.nDatabaseNodes[k].id == pid) {
				pnode = this.nDatabaseNodes[k];
				break;
			}
		}
	}

	var node = new ECONode(id, pid, dsc, nw, nh, color, border, tg, metadata);	//New node creation...
	node.nodeParent = pnode;  //Set it's parent
	pnode.canCollapse = true; //It's obvious that now the parent can collapse	
	var i = this.nDatabaseNodes.length;	//Save it in database
	node.dbIndex = this.mapIDs[id] = i;
	this.nDatabaseNodes[i] = node;
	var h = pnode.nodeChildren.length; //Add it as child of it's parent
	node.siblingIndex = h;
	pnode.nodeChildren[h] = node;

	return node
}

ECOTree.prototype.getNodeById = function (id) {
	return this.nDatabaseNodes.find(node => node.id === id)
}

ECOTree.prototype.getNodeByName = function (name) {
	return this.nDatabaseNodes.find(node => node.dsc === name)
}

module.exports = ECOTree