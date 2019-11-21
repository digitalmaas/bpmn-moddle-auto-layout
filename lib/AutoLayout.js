var BpmnModdle = require('bpmn-moddle'),
    ECOTree = require('./ECOTree'),
    DiFactory = require('./DiFactory');

var STDDIST = 25;
const PADDING = 36 / 2

function AutoLayout() {
  this.moddle = new BpmnModdle();
  this.DiFactory = new DiFactory(this.moddle);
  this.nodeCount = 0
}

module.exports = AutoLayout;

AutoLayout.prototype.layoutProcess = function(xmlStr, callback) {

  var self = this;
  var moddle = this.moddle;
  const createDiPlane = this.DiFactory.createDiPlane.bind(this.DiFactory)
  const createDiDiagram = this.DiFactory.createDiDiagram.bind(this.DiFactory)

  moddle.fromXML(xmlStr, function(error, moddleWithoutDi) {
    if (error) {
      return callback(error)
    }
    // create new di section
    const root = moddleWithoutDi.get('rootElements').find(el => el.$type === 'bpmn:Process')
    const rootDi = createDiPlane({
      id: 'BPMNPlane_1',
      bpmnElement: root
    })
    const newDiagram = createDiDiagram({
      id: 'BPMNDiagram_1',
      plane: rootDi
    })
    moddleWithoutDi.diagrams = [newDiagram]
    // build the tree layout
    self.tree = new ECOTree('myTree')
    root.nodeId = -1
    self._buildTreeBreadFirstSearch(root)
    console.log('tree built')
    self.tree.UpdateTree()
    console.log('tree updated')
    // create di
    self._layoutTreeBreadFirstSearch(root, rootDi);
    moddle.toXML(moddleWithoutDi, callback);
  });
};

AutoLayout.prototype._buildTreeBreadFirstSearch = function (rootFlowElement) {
  var self = this;
  var children = rootFlowElement.flowElements
  // queue holds visited elements
  var queue = children ? [...children] : []
  var elementOrConnection,
      outgoings;
  while (queue.length !== 0) {
      // get first
      elementOrConnection = queue.shift();
      if (elementOrConnection.$type !== 'bpmn:SequenceFlow') {
        // add this node to the tree
        this._addTreeNode(elementOrConnection, children)
      }
      if (elementOrConnection.$type === 'bpmn:SubProcess') {
        // find the start element and continue building the tree
        const rootFlowElements = getStartEvents(elementOrConnection.flowElements)
        rootFlowElements.forEach(rootFlowElement => {
          this._addTreeNode(rootFlowElement, children)
          this._buildTreeBreadFirstSearch(rootFlowElement)
        })
      }
      if(elementOrConnection.$type !== 'bpmn:SequenceFlow') {
        // only if source is an element
        outgoings = getOutgoingConnection(elementOrConnection, children);
        if (outgoings.length) {
          outgoings.forEach(function(connection) {
            // for layouting the connection
            if (!connection.build_marked) {
              connection.build_marked = true;
              queue.push(connection);
            }
            var target = connection.get('targetRef');
            if (!target.build_marked) {
              self._addTreeNode(target, children)
              queue.push(target);
            }
          });
        }
      }
  }
};

AutoLayout.prototype._addTreeNode = function (flowElement, flowElements) {
  var getDefaultSize = this.DiFactory._getDefaultSize.bind(this.DiFactory);
  var self = this;
  let node
  if (!flowElement.build_marked) {
    // add the node
    flowElement.build_marked = true;
    let parentNodes = []
    // get parents
    const incoming = getIncomingConnection(flowElement, flowElements);
    if (incoming.length) {
      incoming.forEach(function(connection) {
        var target = connection.get('sourceRef');
        let parent
        if (target.build_marked) {
          parent = self.tree.getNodeByName(target.id)
        } else {
          parent = self._addTreeNode(target, flowElements)
        }
        parentNodes.push(parent)
      });
    }
    size = getDefaultSize(flowElement);
    node = this.tree.add(this.nodeCount, flowElement.id, size.width, size.height)
    this.nodeCount += 1
    if (parentNodes.length === 0) {
      // root
      this.tree.addParentToNode(node.id, -1)
    } else {
      parentNodes.forEach(parentNode => this.tree.addParentToNode(node.id, parentNode.id))
    }
    const maxParentLevel = node._getLevel() - 1
    console.log('Added ' + flowElement.id + ' as Node ' + this.nodeCount)
    // pad out levels such that node parents are at same level
    const oldParents = [...node.parents]
		oldParents.forEach(parent => {
      let padParent = parent
			while (padParent._getLevel() < maxParentLevel) {
        let oldParent = padParent
        self.tree.removeParentFromNode(node.id, oldParent.id)
        padParent = self.tree.add(this.nodeCount, `padding node ${this.nodeCount}`, 0, 0)
        this.nodeCount += 1
        self.tree.addParentToNode(node.id, padParent.id)
        self.tree.addParentToNode(padParent.id, oldParent.id)
      }
    })
    flowElement.nodeId = node.id
    return node
  } else {
    // find and return the node
    return self.tree.getNodeByName(flowElement.id)
  }
}

AutoLayout.prototype._layoutTreeBreadFirstSearch = function (parentFlowElement, rootDi, parentGroup) {
  var children = parentFlowElement.flowElements;
  var startEvents = children && getStartEvents(children);

  // groups are elements with the same distance
  var group = {
    elements: [],
    connections: [],
    anchor: {
      x: 100,
      // 100 + mid of startEvent
      y: 100 + PADDING
    },
    distance: 0
  };
  if (startEvents) {
    startEvents.forEach(startEvent => {
      startEvent.marked = true;
      startEvent.dist = 0;
    })
  }
  if (parentGroup !== undefined) {
    group.anchor.x = parentGroup.anchor.x + PADDING
    group.anchor.y = parentGroup.anchor.y + PADDING
  }

  // queue holds visited elements
  var queue = startEvents ? [...startEvents] : []

  var elementOrConnection,
      outgoings;

  while (queue.length !== 0) {
      // get first
      elementOrConnection = queue.shift();
      // insert element into group
      group = this._groupElement(elementOrConnection, group, rootDi);
      if (elementOrConnection.$type === 'bpmn:SubProcess') {
        this._layoutTreeBreadFirstSearch(elementOrConnection, rootDi, group);
        this._layoutGroup(group, rootDi);
      }
      if(elementOrConnection.$type !== 'bpmn:SequenceFlow') {
        // only if source is an element
        outgoings = getOutgoingConnection(elementOrConnection, children);
        if (outgoings.length) {
          outgoings.forEach(function(connection) {
            // for layouting the connection
            if (!connection.marked) {
              connection.marked = true;
              connection.dist = elementOrConnection.dist + 1;
              queue.push(connection);
            }
            var target = connection.get('targetRef');
            if (!target.marked) {
              target.marked = true;
              target.dist =  elementOrConnection.dist + 1;
              queue.push(target);
            }
          });
        }
      }
  }
  if (elementOrConnection && elementOrConnection.$type !== 'bpmn:SubProcess') {
    this._layoutGroup(group, rootDi);
  }
};

AutoLayout.prototype._groupElement = function(elementOrConnection, group, parentDi) {
  if (elementOrConnection.dist === group.distance) {
    if (elementOrConnection.$type === 'bpmn:SequenceFlow') {
      group.connections.push(elementOrConnection);
    }
    else {
      group.elements.push(elementOrConnection);
    }
  } else {
    var newAnchor = this._layoutGroup(group, parentDi);
    group = {
      elements: elementOrConnection.$type === 'bpmn:SequenceFlow' ? [] : [elementOrConnection],
      connections: elementOrConnection.$type === 'bpmn:SequenceFlow' ? [elementOrConnection] : [],
      anchor: newAnchor,
      distance: elementOrConnection.dist
    };
  }
  return group;
};

AutoLayout.prototype._layoutGroup = function(group, parentDi) {
  var newAnchor = this._layoutElements(group, parentDi)
  this._layoutConnections(group, parentDi);
  return newAnchor;
};

AutoLayout.prototype._layoutElements = function(group, parentDi) {
  var self = this;
  var createDi = this.DiFactory.createBpmnElementDi.bind(this.DiFactory);
  var getDefaultSize = this.DiFactory._getDefaultSize.bind(this.DiFactory);
  var is = this.DiFactory.is.bind(this.DiFactory);

  const breadFirstSearch = this._layoutTreeBreadFirstSearch.bind(this)

  var elements = group.elements
  var anchor = group.anchor;

  var bottom
  var top;

  top = anchor.y;
  bottom = top
  var childrenDi = parentDi.get('planeElement');
  var elementDi;

  var pos = {
    x: anchor.x,
    y: anchor.y
  };

  var size,
      height,
      width;
  var maxWidth = 0;

  elements.forEach(function(element, index) {
    // check for existing DI element
    const found = childrenDi.find(childDi => {
      return childDi.id.includes(element.id)
    })
    size = getDefaultSize(element);
    height = size.height;
    maxWidth = Math.max(maxWidth, size.width);


    let treeNode = self.tree.getNodeById(element.nodeId)
    if (treeNode) {
      pos.x = treeNode.XPosition
      pos.y = treeNode.YPosition
    }

    /*
    if (is(element.$type, 'bpmn:Gateway')) {
      let incoming = element.get('incoming')
      let outgoing = element.get('outgoing')
      if (outgoing.length < incoming.length) {
        // closing gateway
        // ... find opening and get y position
        let source = incoming[0].get('sourceRef')
        let stack = 0
        while (source.$type !== element.$type && stack >= 0) {
          incoming = source.get('incoming')
          outgoing = source.get('outgoing')
          source = incoming[0].get('sourceRef')
          if (source.$type !== element.$type) {
            if (outgoing.length < incoming.length) {
              stack += 1
            } else if (outgoing.length > incoming.length) {
              stack -= 1
            }
          }
        }

        treeNode = self.tree.getNodeById(source.nodeId)
        pos.y = treeNode.YPosition
      }
    }
    */
    
    element.bounds = Object.assign({}, size, pos);
    elementDi = createDi('shape', element, pos);
    if (found) {
      // replace exisiting with latest
      childrenDi.splice(childrenDi.indexOf(found), 1, elementDi)
    } else {
      childrenDi.push(elementDi);
    }
    if (element.flowElements && element.$type === 'bpmn:SubProcess') {
      // element repositioned ... redraw children
      element.flowElements.forEach(el => el.marked = false)
      let subgroup = {
        elements: element.flowElements,
        connections: [],
        anchor: {
          x: pos.x,
          y: pos.y + (height / 2) - (PADDING / 2)
        }
      }
      breadFirstSearch(element, parentDi, subgroup);
    }
  });
  return {
    x: anchor.x + maxWidth + (2 * STDDIST),
    y: anchor.y
  };
};

AutoLayout.prototype._layoutConnections = function(group, parentDi) {
  var createDi = this.DiFactory.createBpmnElementDi.bind(this.DiFactory);
  var childrenDi = parentDi.get('planeElement');
  var connections = group.connections;
  connections.forEach(function(connection) {
    // check for existing DI element
    const found = childrenDi.find(childDi => {
      return childDi.id.includes(connection.id)
    })
    var connectionDi = createDi('connection', connection);
    if (found) {
      // replace exisiting with latest
      childrenDi.splice(childrenDi.indexOf(found), 1, connectionDi)
    } else {
      childrenDi.push(connectionDi);
    }
  });
};


/////// helpers //////////////////////////////////

function getStartEvents(flowElements) {
  return flowElements.filter(function(e) {
    return e.$type === 'bpmn:StartEvent';
  })
}

function getOutgoingConnection(source, flowElements) {
  return flowElements.filter(function(e) {
    return e.$type === 'bpmn:SequenceFlow' && e.get('sourceRef').id === source.id;
  });
}

function getIncomingConnection(target, flowElements) {
  return flowElements.filter(function(c) {
    return c.$type === 'bpmn:SequenceFlow' && c.get('targetRef').id === target.id
  });
}
