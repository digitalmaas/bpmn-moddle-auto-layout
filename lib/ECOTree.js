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

ECONode = function (id, dsc, w, h) {
	this.id = id;
	this.dsc = dsc;
	this.w = w;
	this.h = h;

	this.dbIndex = 0;

	this.XPosition = 0;
	this.YPosition = 0;
	this.prelim = 0;
	this.modifier = 0;
	this.leftNeighbor = null;
	this.rightNeighbor = null;
	this.nodeParent = null;

	this.parents = [];
	this.children = [];

	this.isCollapsed = false;

	this.isSelected = false;
}

ECONode.prototype._getLevel = function () {
	if (this.parents === undefined || this.parents.length === 0) {
		return 0
	} else {
		let maxLevel = 0
		this.parents.forEach(parent => {
			const parentLevel = parent._getLevel()
			maxLevel = (maxLevel < parentLevel) ? parentLevel : maxLevel
		})
		return maxLevel + 1
	}
}

ECONode.prototype._areParentsCollapsed = function () {
	if (this.parents === undefined || this.parents.length === 0) {
		return this.isCollapsed
	} else {
		this.parents.forEach(parent => {
			if (parent._areParentsCollapsed()) {
				return true
			}
		})
		return false
	}
}


ECONode.prototype._getChildrenCount = function () {
	if (this.isCollapsed) return 0;
	if (this.children == null)
		return 0;
	else
		return this.children.length;
}

ECONode.prototype._getLeftSibling = function () {
	if (!this.leftNeighbor) {
		return null
	}
	const haveSameParent = this.leftNeighbor.parents.find(lParent => {
		return this.parents.find(tParent => tParent.id === lParent.id)
	})
	if (haveSameParent !== undefined)
		return this.leftNeighbor;
	else
		return null;
}

ECONode.prototype._getRightSibling = function () {
	if (!this.rightNeighbor) {
		return null
	}
	const haveSameParent = this.rightNeighbor.parents.find(rParent => {
		return this.parents.find(tParent => tParent.id === rParent.id)
	})
	if (haveSameParent !== undefined)
		return this.rightNeighbor;
	else
		return null;
}

ECONode.prototype._getChildAt = function (i) {
	return this.children[i];
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

ECOTree = function () {
	this.config = {
		iMaxDepth: 100,
		iLevelSeparation: 50,
		iSiblingSeparation: 20,
		iSubtreeSeparation: 20,
		topXAdjustment: 0,
		topYAdjustment: 0
	}

	this.self = this;

	this.maxLevelHeight = [];
	this.maxLevelWidth = [];
	this.previousLevelNode = [];

	this.rootYOffset = 0;
	this.rootXOffset = 0;

	this.nDatabaseNodes = [];
	this.mapIDs = {};

	this.root = new ECONode(-1, null, null, 2, 2);
	this.iLastSearch = 0;

}

//Layout algorithm
ECOTree._firstWalk = function (tree, node, level, prevSiblings = []) {
	// console.log('_firstWalk()')
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
		if (leftSibling != null) {
			node.prelim = leftSibling.prelim + tree._getNodeSize(leftSibling) + tree.config.iSiblingSeparation;
		} else {
			node.prelim = 0;
		}
	}
	else {
		var n = node._getChildrenCount();
		for (var i = 0; i < n; i++) {
			var iChild = node._getChildAt(i);
			ECOTree._firstWalk(tree, iChild, level + 1, [...prevSiblings, iChild.id]);
		}

		var midPoint = node._getChildrenCenter(tree);
		midPoint -= tree._getNodeSize(node) / 2;
		leftSibling = node._getLeftSibling();
		if (leftSibling != null  && !prevSiblings.includes(leftSibling.id)) {
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
	// console.log('_apportion()')
	var firstChild = node._getFirstChild();
	var firstChildLeftNeighbor = firstChild.leftNeighbor;
	var j = 1;
	for (var k = tree.config.iMaxDepth - level; firstChild != null && firstChildLeftNeighbor != null && j <= k;) {
		var modifierSumRight = 0;
		var modifierSumLeft = 0;
		var rightAncestor = firstChild;
		var leftAncestor = firstChildLeftNeighbor;
		for (var l = 0; l < j; l++) {
			rightAncestor = rightAncestor.parents[0]
			leftAncestor = leftAncestor.parents[0]
			modifierSumRight += rightAncestor.modifier
			modifierSumLeft += leftAncestor.modifier
		}

		var totalGap = (firstChildLeftNeighbor.prelim + modifierSumLeft + tree._getNodeSize(firstChildLeftNeighbor) + tree.config.iSubtreeSeparation) - (firstChild.prelim + modifierSumRight);
		if (totalGap > 0) {
			var subtreeAux = node;
			var numSubtrees = 0;
			for (; subtreeAux != null && subtreeAux != leftAncestor; subtreeAux = subtreeAux._getLeftSibling()) {
				numSubtrees++;
			}

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

ECOTree._secondWalk = function (tree, node, level, X, Y, prevSiblings = []) {
	// console.log('_secondWalk()')
	if (level <= tree.config.iMaxDepth) {
		var xTmp = tree.rootXOffset + node.prelim + X;
		var yTmp = tree.rootYOffset + Y;
		var maxsizeTmp = 0;
		var nodesizeTmp = 0;
		var flag = false;

		maxsizeTmp = tree.maxLevelWidth[level];
		flag = true;
		nodesizeTmp = node.w;

		node.XPosition = xTmp;
		node.YPosition = yTmp + (maxsizeTmp - nodesizeTmp) / 2;

		if (flag) {
			var swapTmp = node.XPosition;
			node.XPosition = node.YPosition;
			node.YPosition = swapTmp;
		}
		if (node._getChildrenCount() != 0) {
			ECOTree._secondWalk(tree, node._getFirstChild(), level + 1, X + node.modifier, Y + maxsizeTmp + tree.config.iLevelSeparation, [...prevSiblings, node.id]);
		}
		var rightSibling = node._getRightSibling();
		if (rightSibling != null && !prevSiblings.includes(rightSibling.id))
			ECOTree._secondWalk(tree, rightSibling, level, X, Y, [...prevSiblings, node.id]);
	}
}

ECOTree.prototype._positionTree = function () {
	// console.log('_positionTree()')
	this.maxLevelHeight = [];
	this.maxLevelWidth = [];
	this.previousLevelNode = [];
	ECOTree._firstWalk(this.self, this.root, 0);

	
	this.rootXOffset = this.config.topXAdjustment + this.root.XPosition;
	this.rootYOffset = this.config.topYAdjustment + this.root.YPosition;

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
	return node.h;
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

ECOTree.prototype.add = function (id, dsc, w, h) {
	var nw = w
	var nh = h
	var node = new ECONode(id, dsc, nw, nh);	//New node creation...
	var i = this.nDatabaseNodes.length;	//Save it in database
	node.dbIndex = this.mapIDs[id] = i;
	this.nDatabaseNodes[i] = node;
	return node
}

ECOTree.prototype.addParentToNode = function (nodeId, parentId) {
	// retrieve nodes from list
	const node = this.getNodeById(nodeId)
	const parent = (parentId === -1) ? this.root : this.getNodeById(parentId)
	if (node === undefined) {
		throw new Error('Node not found')
	}
	if (parent === undefined) {
		throw new Error('Parent node not found')
	}
	// confirm this parents hasn't already been added to this node
	let found = node.parents.find(parent => parent.id === parentId)
	if (found === undefined) {
		node.parents.push(parent)
		// confirm that the child hasnt been added to the parents children list
		let found = parent.children.find(child => child.id === nodeId)
		if (found === undefined) {
			parent.children.push(node)
		}
	}
}

ECOTree.prototype.removeParentFromNode = function (nodeId, parentId) {
	// retrieve nodes from list
	const node = this.getNodeById(nodeId)
	const parent = (parentId === -1) ? this.root : this.getNodeById(parentId)
	if (node === undefined) {
		throw new Error('Node not found')
	}
	if (parent === undefined) {
		throw new Error('Parent node not found')
	}
	// remove the parent node from node parents
	node.parents = node.parents.filter(parent => parent.id !== parentId)
	// remove the ndoe form the parent children list
	parent.children = parent.children.filter(child => child.id !== nodeId)
}

ECOTree.prototype.getNodeById = function (id) {
	return this.nDatabaseNodes.find(node => node.id === id)
}

ECOTree.prototype.getNodeByName = function (name) {
	return this.nDatabaseNodes.find(node => node.dsc === name)
}

module.exports = ECOTree