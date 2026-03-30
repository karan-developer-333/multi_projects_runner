import streamlit as st

st.title("Todo App")

# Initialize session state for todos
if 'todos' not in st.session_state:
    st.session_state.todos = []

# Input for new todo
new_todo = st.text_input("Add a new todo item")

# Button to add todo
if st.button("Add Todo") and new_todo.strip():
    st.session_state.todos.append(new_todo.strip())
    st.rerun()

# Display todos with delete buttons
st.subheader("Your Todos")
for i, todo in enumerate(st.session_state.todos):
    col1, col2 = st.columns([4, 1])
    with col1:
        st.write(f"- {todo}")
    with col2:
        if st.button("Delete", key=f"delete_{i}"):
            del st.session_state.todos[i]
            st.rerun()

# If no todos
if not st.session_state.todos:
    st.write("No todos yet. Add one above!")
