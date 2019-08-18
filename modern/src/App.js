import React, { useEffect, useReducer, useState } from "react";
import "./App.css";
import * as Utils from "./utils";
import * as Actions from "./Actions";
import * as Selectors from "./Selectors";
// import simpleSkin from "../skins/simple.wal";
import cornerSkin from "../skins/CornerAmp_Redux.wal";
import { useDispatch, useSelector, useStore } from "react-redux";
import DropTarget from "../../js/components/DropTarget";
import Debugger from "./debugger";
import Sidebar from "./Sidebar";

function useJsUpdates(node) {
  const [ignored, forceUpdate] = useReducer(x => x + 1, 0);
  useEffect(() => node.js_listen("js_update", forceUpdate));
}

let mouseposition;

function handleMouseEventDispatch(node, event, eventName) {
  event.stopPropagation();

  // In order to properly calculate the x/y coordinates like MAKI does we need
  // to find the container element and calculate based off of that
  const container = Utils.findParentOrCurrentNodeOfType(
    node,
    new Set(["container"])
  );
  const clientX = event.clientX;
  const clientY = event.clientY;
  const x = clientX - container.getleft();
  const y = clientY - container.gettop();
  node.js_trigger(eventName, x, y);

  if (event.nativeEvent.type === "mousemove") {
    mouseposition = { x: clientX, y: clientY };
  }

  if (event.nativeEvent.type === "mousedown") {
    // We need to persist the react event so we can access the target
    event.persist();
    document.addEventListener("mouseup", function globalMouseUp(ev) {
      document.removeEventListener("mouseup", globalMouseUp);
      // Create an object that looks and acts like an event, but has mixed
      // properties from original mousedown event and new mouseup event
      const fakeEvent = {
        target: event.target,
        clientX: ev.clientX,
        clientY: ev.clientY,
        nativeEvent: {
          type: "mouseup",
        },
        stopPropagation: ev.stopPropagation.bind(ev),
      };
      handleMouseEventDispatch(
        node,
        fakeEvent,
        eventName === "onLeftButtonDown" ? "onLeftButtonUp" : "onRightButtonUp"
      );
    });
  }
}

function handleMouseButtonEventDispatch(
  node,
  event,
  leftEventName,
  rightEventName
) {
  handleMouseEventDispatch(
    node,
    event,
    event.button === 2 ? rightEventName : leftEventName
  );
}

function GuiObjectEvents({ Component, node, children }) {
  return (
    <div
      onMouseDown={e =>
        handleMouseButtonEventDispatch(
          node,
          e,
          "onLeftButtonDown",
          "onRightButtonDown"
        )
      }
      onDoubleClick={e =>
        handleMouseButtonEventDispatch(
          node,
          e,
          "onLeftButtonDblClk",
          "onRightButtonDblClk"
        )
      }
      onMouseMove={e => handleMouseEventDispatch(node, e, "onMouseMove")}
      onMouseEnter={e => handleMouseEventDispatch(node, e, "onEnterArea")}
      onMouseLeave={e => handleMouseEventDispatch(node, e, "onLeaveArea")}
      onDragEnter={e => node.js_trigger("onDragEnter")}
      onDragLeave={e => node.js_trigger("onDragLeave")}
      onDragOver={e => handleMouseEventDispatch(node, e, "onDragOver")}
      onKeyUp={e => node.js_trigger("onKeyUp", e.keyCode)}
      onKeyDown={e => node.js_trigger("onKeyDown", e.keyCode)}
      onContextMenu={e => {
        e.preventDefault();
        return false;
      }}
    >
      <Component node={node} {...node.attributes}>
        {children}
      </Component>
    </div>
  );
}

function Container(props) {
  const { id, children, default_x, default_y, default_visible } = props;
  const style = {
    position: "absolute",
  };
  if (default_x !== undefined) {
    style.left = Number(default_x);
  }
  if (default_y !== undefined) {
    style.top = Number(default_y);
  }
  if (default_visible !== undefined) {
    style.display = default_visible ? "block" : "none";
  }
  return (
    <div data-node-type="container" data-node-id={id} style={style}>
      {children}
    </div>
  );
}

function Layout({
  node,
  id,
  background,
  desktopalpha,
  drawBackground,
  x,
  y,
  w,
  h,
  minimum_h,
  maximum_h,
  minimum_w,
  maximum_w,
  droptarget,
  children,
}) {
  if (drawBackground && background == null) {
    console.warn("Got a Layout without a background. Rendering null", id);
    return null;
  }

  if (drawBackground) {
    const image = node.js_imageLookup(background);
    if (image == null) {
      console.warn(
        "Unable to find image to render. Rendering null",
        background
      );
      return null;
    }

    return (
      <div
        data-node-type="layout"
        data-node-id={id}
        src={image.imgUrl}
        draggable={false}
        style={{
          backgroundImage: `url(${image.imgUrl})`,
          width: image.w,
          height: image.h,
          // TODO: This combo of height/minHeight ect is a bit odd. How should we combine these?
          minWidth: minimum_w == null ? null : Number(minimum_w),
          minHeight: minimum_h == null ? null : Number(minimum_h),
          maxWidth: maximum_w == null ? null : Number(maximum_w),
          maxHeight: maximum_h == null ? null : Number(maximum_h),
          position: "absolute",
        }}
      >
        {children}
      </div>
    );
  }

  const params = {};
  if (x !== undefined) {
    params.left = Number(x);
  }
  if (y !== undefined) {
    params.top = Number(y);
  }
  if (w !== undefined) {
    params.width = Number(w);
  }
  if (h !== undefined) {
    params.height = Number(h);
  }

  return (
    <div
      data-node-type="layout"
      data-node-id={id}
      draggable={false}
      style={{
        position: "absolute",
        ...params,
      }}
    >
      {children}
    </div>
  );
}

function Layer({ node, id, image, children, x, y }) {
  if (image == null) {
    console.warn("Got an Layer without an image. Rendering null", id);
    return null;
  }
  const img = node.js_imageLookup(image.toLowerCase());
  if (img == null) {
    console.warn("Unable to find image to render. Rendering null", image);
    return null;
  }
  const params = {};
  if (x !== undefined) {
    params.left = Number(x);
  }
  if (y !== undefined) {
    params.top = Number(y);
  }
  if (img.x !== undefined) {
    params.backgroundPositionX = -Number(img.x);
  }
  if (img.y !== undefined) {
    params.backgroundPositionY = -Number(img.y);
  }
  if (img.w !== undefined) {
    params.width = Number(img.w);
  }
  if (img.h !== undefined) {
    params.height = Number(img.h);
  }
  if (img.imgUrl !== undefined) {
    params.backgroundImage = `url(${img.imgUrl}`;
  }
  return (
    <div
      data-node-type="Layer"
      data-node-id={id}
      draggable={false}
      style={{ position: "absolute", ...params }}
    >
      {children}
    </div>
  );
}

function Button({
  id,
  image,
  action,
  x,
  y,
  downImage,
  tooltip,
  node,
  children,
}) {
  const [down, setDown] = React.useState(false);
  const imgId = down && downImage ? downImage : image;
  if (imgId == null) {
    console.warn("Got a Button without a imgId. Rendering null", id);
    return null;
  }
  // TODO: These seem to be switching too fast
  const img = node.js_imageLookup(imgId);
  if (img == null) {
    console.warn("Unable to find image to render. Rendering null", image);
    return null;
  }

  return (
    <div
      data-node-type="button"
      data-node-id={id}
      onMouseDown={e => {
        setDown(true);
        document.addEventListener("mouseup", () => {
          // TODO: This could be unmounted
          setDown(false);
        });
      }}
      onClick={e => {
        if (e.button === 2) {
          node.js_trigger("onRightClick");
        } else {
          node.js_trigger("onLeftClick");
        }
      }}
      title={tooltip}
      style={{
        position: "absolute",
        top: Number(y),
        left: Number(x),
        backgroundPositionX: -Number(img.x),
        backgroundPositionY: -Number(img.y),
        width: Number(img.w),
        height: Number(img.h),
        backgroundImage: `url(${img.imgUrl})`,
      }}
    >
      {children}
    </div>
  );
}

function Popupmenu({ id, node }) {
  const children = node.commands.map(item => {
    if (item.id === "seperator") {
      return <li />;
    }
    return (
      <li
        key={item.id}
        onClick={() => {
          node.js_selectCommand(item.id);
        }}
      >
        {item.name}
      </li>
    );
  });
  const { x, y } = mouseposition;
  // TODO: Actually properly style element
  return (
    <div
      data-node-type="Popmenu"
      data-node-id={id}
      style={{
        position: "absolute",
        top: Number(y),
        left: Number(x),
        backgroundColor: "#000000",
        color: "#FFFFFF",
      }}
    >
      <ul>{children}</ul>
    </div>
  );
}

function ToggleButton(props) {
  return <Button data-node-type="togglebutton" {...props} />;
}

function Group(props) {
  const { id, children, x, y } = props;
  const style = {
    position: "absolute",
  };
  if (x !== undefined) {
    style.left = Number(x);
  }
  if (y !== undefined) {
    style.top = Number(y);
  }
  return (
    <div data-node-type="group" data-node-id={id} style={style}>
      {children}
    </div>
  );
}

function Text({
  node,
  id,
  children,
  display,
  ticker,
  antialias,
  x,
  y,
  w,
  h,
  font,
  fontsize,
  color,
  align,
}) {
  const params = {};
  if (x !== undefined) {
    params.left = Number(x);
  }
  if (y !== undefined) {
    params.top = Number(y);
  }
  if (w !== undefined) {
    params.width = Number(w);
  }
  if (h !== undefined) {
    params.height = Number(h);
  }
  if (color !== undefined) {
    params.color = `rgb(${color})`;
  }
  if (fontsize !== undefined) {
    params.fontSize = `${fontsize}px`;
  }
  if (align !== undefined) {
    params.textAlign = align;
  }
  // display is actually a keyword that is looked up in some sort of map
  // e.g. songname, time
  const nodeText = display;
  return (
    <div
      data-node-type="Text"
      data-node-id={id}
      draggable={false}
      style={{
        position: "absolute",
        userSelect: "none",
        MozUserSelect: "none",
        ...params,
      }}
    >
      {nodeText}
      {children}
    </div>
  );
}

const NODE_NAME_TO_COMPONENT = {
  container: Container,
  layout: Layout,
  layer: Layer,
  button: Button,
  togglebutton: ToggleButton,
  group: Group,
  popupmenu: Popupmenu,
  text: Text,
};

const NODE_NO_EVENTS = new Set(["popupmenu"]);

// Given a skin XML node, pick which component to use, and render it.
function XmlNode({ node }) {
  const attributes = node.attributes;
  const name = node.name;
  if (name == null || name === "groupdef") {
    // name is null is likely a comment
    return null;
  }
  useJsUpdates(node);
  const Component = NODE_NAME_TO_COMPONENT[name];
  const childNodes = node.children || [];
  const children = childNodes.map(
    (childNode, i) => childNode.visible && <XmlNode key={i} node={childNode} />
  );
  if (Component == null) {
    console.warn("Unknown node type", name);
    if (childNodes.length) {
      return <>{children}</>;
    }
    return null;
  }

  if (NODE_NO_EVENTS.has(name)) {
    return (
      <Component node={node} {...node.attributes}>
        {children}
      </Component>
    );
  }

  return (
    <GuiObjectEvents Component={Component} node={node}>
      {children}
    </GuiObjectEvents>
  );
}

function App() {
  const dispatch = useDispatch();
  const store = useStore();
  const root = useSelector(Selectors.getMakiTree);
  React.useEffect(() => {
    dispatch(Actions.gotSkinUrl(cornerSkin, store));
  }, [store]);
  if (root == null) {
    return <h1>Loading...</h1>;
  }
  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex" }}>
      <DropTarget
        style={{ width: "100%", height: "100%" }}
        handleDrop={e => {
          dispatch(Actions.gotSkinBlob(e.dataTransfer.files[0]));
        }}
      >
        <XmlNode node={root} />
      </DropTarget>
      <Sidebar>
        <Debugger />
      </Sidebar>
    </div>
  );
}

export default App;
