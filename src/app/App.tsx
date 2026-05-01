import MDWrapper from "../notepad/markdown/wrapper";
import "./App.css";

function App() {
	return (
		<main>
			<div
				id="screen"
				className="w-screen h-screen flex items-center justify-center"
			>
				<div className="">
					<MDWrapper />
				</div>
			</div>
		</main>
	);
}

export default App;
